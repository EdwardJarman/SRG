import { Editor, Notice, Plugin, TFile } from "obsidian";
import { buildQueueForSettings, computeStats } from "./core/stats";
import { Card, GardenSettings } from "./core/types";
import { GardenView, GARDEN_VIEW_TYPE } from "./garden/gardenView";
import { ManageView, MANAGE_VIEW_TYPE } from "./garden/manageView";
import { bindFlushOnBlur } from "./plugin/lifecycle";
import { handleVaultCreate, handleVaultDelete, handleVaultRename, VaultEventHost } from "./plugin/vaultEvents";
import { ReviewModal } from "./review/reviewModal";
import { CardService } from "./services/cardService";
import { SRGSettingsTab, sanitizeSettings } from "./settings";
import { GardenStore, GARDEN_FILE, GARDEN_FOLDER } from "./store/cardStore";
import { plantFlashcard } from "./vault/cardCreator";

export default class SpacedRepetitionGardenPlugin extends Plugin {
  store!: GardenStore;
  cards!: CardService;
  settings: GardenSettings = sanitizeSettings(null);
  private statusBarEl: HTMLElement | null = null;
  private lastStoreProblem: string | null = null;

  async onload(): Promise<void> {
    this.settings = sanitizeSettings((await this.loadData()) as Partial<GardenSettings> | null);

    this.store = new GardenStore(this.app, GARDEN_FILE);
    await this.store.load();
    if (this.store.loadProblem) new Notice(this.store.loadProblem, 10000);
    this.cards = new CardService(this.app, this.store, () => this.settings);

    this.registerView(GARDEN_VIEW_TYPE, (leaf) => new GardenView(leaf, this));
    this.registerView(MANAGE_VIEW_TYPE, (leaf) => new ManageView(leaf, this));

    const eventHost: VaultEventHost = {
      store: this.store,
      notify: (message, timeout) => {
        new Notice(message, timeout);
      },
    };

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        handleVaultRename(eventHost, oldPath, file.path);
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!(file instanceof TFile)) return;
        handleVaultDelete(eventHost, file.path);
      }),
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        handleVaultCreate(eventHost, file.path);
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (file.path === GARDEN_FILE) {
          void this.store.syncFromDisk();
          return;
        }
        if (file.path.startsWith(`${GARDEN_FOLDER}/`) && /conflict/i.test(file.path)) {
          void this.store.syncConflictCopies();
          return;
        }
        void this.cards.reconcileFileAnchors(file.path);
      }),
    );

    this.addCommand({
      id: "plant-flashcard",
      name: "Plant flashcard from note or heading",
      editorCallback: (editor, ctx) => this.plantFromView(editor, ctx.file),
    });

    this.addCommand({
      id: "review-due-cards",
      name: "Review due cards",
      callback: () => this.openReviewDue(),
    });

    this.addCommand({
      id: "open-garden",
      name: "Open garden",
      callback: () => void this.openGarden(),
    });

    this.addCommand({
      id: "manage-plants",
      name: "Manage plants",
      callback: () => void this.openManage(),
    });

    this.addCommand({
      id: "remove-missing-plants",
      name: "Move plants with missing notes to trash",
      callback: () => void this.cards.trashMissing(),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) =>
          item
            .setTitle("Plant as flashcard")
            .setIcon("sprout")
            .onClick(() => this.plantFromView(editor, view.file)),
        );
      }),
    );

    this.addRibbonIcon("sprout", "Spaced Repetition Garden: open garden", () => void this.openGarden());

    this.statusBarEl = this.addStatusBarItem();
    this.register(
      this.store.onChange(() => {
        this.updateStatusBar();
        this.notifyStoreProblem();
      }),
    );
    this.registerInterval(window.setInterval(() => this.updateStatusBar(), 5 * 60 * 1000));
    this.updateStatusBar();

    this.app.workspace.onLayoutReady(() => {
      void this.reconcileVault();
    });

    this.register(
      bindFlushOnBlur(window, document, () => {
        void this.store.flush();
      }),
    );

    this.addSettingTab(new SRGSettingsTab(this.app, this));
  }

  onunload(): void {
    if (this.store) void this.store.flush();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openGarden(): Promise<void> {
    await this.openView(GARDEN_VIEW_TYPE);
  }

  async openManage(): Promise<void> {
    await this.openView(MANAGE_VIEW_TYPE);
  }

  private async openView(viewType: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: viewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  openReviewDue(): void {
    if (this.store.isReadOnly()) {
      new Notice(this.store.getReadOnlyReason() ?? "This garden is read-only.");
      return;
    }
    const now = Date.now();
    const queue = buildQueueForSettings(this.store.getCards(), now, this.settings);
    if (queue.length === 0) {
      new Notice("Nothing is due - your garden is at peace.");
      return;
    }
    new ReviewModal(this.app, this.cards).open();
  }

  openCardReview(card: Card): void {
    if (this.store.isReadOnly()) {
      new Notice(this.store.getReadOnlyReason() ?? "This garden is read-only.");
      return;
    }
    const latest = this.store.getCard(card.id) ?? card;
    new ReviewModal(this.app, this.cards, [latest]).open();
  }

  updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const problem = this.store.getStatusProblem();
    if (problem) {
      this.statusBarEl.setText("Garden: save problem");
      this.statusBarEl.setAttribute("aria-label", problem);
      this.statusBarEl.title = problem;
      return;
    }
    const stats = computeStats(this.store.getCards(), this.store.getData().daily, Date.now(), this.settings);
    const dueText = stats.due === 0 ? "all clear" : `${stats.due} due`;
    const retentionText = stats.retention === null ? "-" : `${Math.round(stats.retention * 100)}%`;
    this.statusBarEl.setText(`Garden: ${dueText} · ${stats.streak}d · ${retentionText}`);
    this.statusBarEl.setAttribute("aria-label", "Cards due today · review streak · retention rate");
    this.statusBarEl.title = "";
  }

  private notifyStoreProblem(): void {
    const problem = this.store.getStatusProblem();
    if (problem === this.lastStoreProblem) return;
    this.lastStoreProblem = problem;
    if (problem) new Notice(problem, 12000);
  }

  private async reconcileVault(): Promise<void> {
    const { markedMissing, restored } = await this.store.reconcileMissingNotes();
    if (markedMissing === 0 && restored === 0) return;
    const parts: string[] = [];
    if (markedMissing > 0) {
      parts.push(
        markedMissing === 1
          ? "1 plant lost its note while the garden was closed"
          : `${markedMissing} plants lost their notes while the garden was closed`,
      );
    }
    if (restored > 0) {
      parts.push(
        restored === 1 ? "1 plant found its note again" : `${restored} plants found their notes again`,
      );
    }
    new Notice(`${parts.join("; ")}.`, 10000);
  }

  private plantFromView(editor: Editor, file: TFile | null): void {
    if (this.store.isReadOnly()) {
      new Notice(this.store.getReadOnlyReason() ?? "This garden is read-only.");
      return;
    }
    if (!file) {
      new Notice("Open a note first - a card is planted from the note you are reading.");
      return;
    }
    const outcome = plantFlashcard(this.store, editor, file);
    if (outcome.status === "error") {
      new Notice(`Could not plant a card: ${outcome.description}`);
      return;
    }
    if (outcome.status === "trashed") {
      new Notice(`Already planted, but in the trash: ${outcome.description}. Restore it in Manage plants.`);
      return;
    }
    new Notice(`${outcome.status === "planted" ? "Planted" : "Already planted"}: ${outcome.description}.`);
  }
}
