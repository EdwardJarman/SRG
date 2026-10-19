import { Editor, Notice, Plugin, TFile } from "obsidian";
import { buildQueue, computeStats } from "./core/stats";
import { Card, GardenSettings } from "./core/types";
import { GardenView, GARDEN_VIEW_TYPE } from "./garden/gardenView";
import { ReviewModal } from "./review/reviewModal";
import { SRGSettingsTab, sanitizeSettings } from "./settings";
import { GardenStore, GARDEN_FILE } from "./store/cardStore";
import { plantFlashcard } from "./vault/cardCreator";

export default class SpacedRepetitionGardenPlugin extends Plugin {
  store!: GardenStore;
  settings: GardenSettings = sanitizeSettings(null);
  private statusBarEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.settings = sanitizeSettings((await this.loadData()) as Partial<GardenSettings> | null);

    this.store = new GardenStore(this.app, GARDEN_FILE);
    await this.store.load();
    if (this.store.loadProblem) new Notice(this.store.loadProblem, 10000);

    this.registerView(GARDEN_VIEW_TYPE, (leaf) => new GardenView(leaf, this));

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.store.repointFile(oldPath, file.path);
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
    this.register(this.store.onChange(() => this.updateStatusBar()));
    this.registerInterval(window.setInterval(() => this.updateStatusBar(), 5 * 60 * 1000));
    this.updateStatusBar();

    this.addSettingTab(new SRGSettingsTab(this.app, this));
  }

  onunload(): void {
    if (this.store) void this.store.flush();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openGarden(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(GARDEN_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: GARDEN_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  openReviewDue(): void {
    const now = Date.now();
    const queue = buildQueue(
      this.store.getCards(),
      now,
      this.settings.dayStartHour,
      this.settings.newCardsPerDay,
    );
    if (queue.length === 0) {
      new Notice("Nothing is due - your garden is at peace.");
      return;
    }
    new ReviewModal(this.app, this.store, () => this.settings).open();
  }

  openCardReview(card: Card): void {
    const latest = this.store.getCard(card.id) ?? card;
    new ReviewModal(this.app, this.store, () => this.settings, [latest]).open();
  }

  updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const stats = computeStats(this.store.getCards(), this.store.getData().daily, Date.now(), this.settings);
    const dueText = stats.due === 0 ? "all clear" : `${stats.due} due`;
    const retentionText = stats.retention === null ? "-" : `${Math.round(stats.retention * 100)}%`;
    this.statusBarEl.setText(`Garden: ${dueText} · ${stats.streak}d · ${retentionText}`);
    this.statusBarEl.setAttribute("aria-label", "Cards due today · review streak · retention rate");
  }

  private plantFromView(editor: Editor, file: TFile | null): void {
    if (!file) {
      new Notice("Open a note first - a card is planted from the note you are reading.");
      return;
    }
    const outcome = plantFlashcard(this.store, editor, file);
    if (outcome.status === "error") {
      new Notice(`Could not plant a card: ${outcome.description}`);
      return;
    }
    new Notice(`${outcome.status === "planted" ? "Planted" : "Already planted"}: ${outcome.description}.`);
  }
}
