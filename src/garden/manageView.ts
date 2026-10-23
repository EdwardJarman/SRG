import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import { anchorLabel } from "../core/anchor";
import { logicalDayEnd } from "../core/dates";
import { overdueDays } from "../core/stats";
import { Card } from "../core/types";
import type SpacedRepetitionGardenPlugin from "../main";
import { addCardActions } from "./cardMenu";
import { bedNameFor } from "./layout";
import { buildPlantModel, PlantModel, PlantStage, plantStatusText } from "./plantModel";

export const MANAGE_VIEW_TYPE = "spaced-repetition-garden-manage";

type StateFilter =
  | "all"
  | "due"
  | "overdue"
  | "upcoming"
  | "seed"
  | "suspended"
  | "missing"
  | "trash";

const STATE_FILTERS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "Every plant" },
  { value: "due", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Still resting" },
  { value: "seed", label: "Seeds" },
  { value: "suspended", label: "Suspended" },
  { value: "missing", label: "Missing notes" },
  { value: "trash", label: "Trash" },
];

const STAGE_ICONS: Record<PlantStage, string> = {
  seed: "🌰",
  sprout: "🌱",
  growing: "🌿",
  established: "🌻",
};

function iconFor(model: PlantModel): string {
  if (model.card.trashedAt !== null) return "🗑️";
  if (model.condition === "missing") return "👻";
  if (model.condition === "wilting") return "🥀";
  if (model.condition === "blooming") return "🌸";
  return STAGE_ICONS[model.stage];
}

function removedText(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

interface Row {
  card: Card;
  model: PlantModel;
  bed: string;
}

export class ManageView extends ItemView {
  private readonly plugin: SpacedRepetitionGardenPlugin;

  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private searchEl!: HTMLInputElement;
  private bedEl!: HTMLSelectElement;
  private stateEl!: HTMLSelectElement;
  private removeMissingBtn!: HTMLButtonElement;
  private emptyTrashBtn!: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;

  private query = "";
  private bedFilter = "all";
  private stateFilter: StateFilter = "all";

  constructor(leaf: WorkspaceLeaf, plugin: SpacedRepetitionGardenPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return MANAGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Manage plants";
  }

  getIcon(): string {
    return "list-todo";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("srg-manage-root");

    const toolbar = root.createDiv({ cls: "srg-manage-toolbar" });

    this.searchEl = toolbar.createEl("input", { cls: "srg-manage-search" });
    this.searchEl.type = "search";
    this.searchEl.placeholder = "Search plants";
    this.searchEl.addEventListener("input", () => {
      this.query = this.searchEl.value.trim().toLowerCase();
      this.renderList();
    });

    this.bedEl = toolbar.createEl("select", { cls: "srg-manage-select" });
    this.bedEl.addEventListener("change", () => {
      this.bedFilter = this.bedEl.value;
      this.renderList();
    });

    this.stateEl = toolbar.createEl("select", { cls: "srg-manage-select" });
    for (const filter of STATE_FILTERS) {
      this.stateEl.createEl("option", { value: filter.value, text: filter.label });
    }
    this.stateEl.addEventListener("change", () => {
      this.stateFilter = this.stateEl.value as StateFilter;
      this.renderList();
    });

    const actions = toolbar.createDiv({ cls: "srg-manage-toolbar-actions" });
    this.removeMissingBtn = actions.createEl("button", {
      cls: "srg-manage-toolbar-btn",
      text: "Remove missing",
    });
    this.removeMissingBtn.addEventListener("click", () => this.plugin.cards.trashMissing());
    this.emptyTrashBtn = actions.createEl("button", {
      cls: "srg-manage-toolbar-btn",
      text: "Empty trash",
    });
    this.emptyTrashBtn.addEventListener("click", () => this.plugin.cards.emptyTrash());
    const reset = actions.createEl("button", {
      cls: "srg-manage-toolbar-btn srg-manage-danger",
      text: "Reset garden",
    });
    reset.addEventListener("click", () => this.plugin.cards.resetGarden());

    this.countEl = root.createDiv({ cls: "srg-manage-count" });
    this.listEl = root.createDiv({ cls: "srg-manage-list" });

    this.unsubscribe = this.plugin.store.onChange(() => this.renderList());
    this.renderList();
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private rows(): Row[] {
    const now = Date.now();
    const dayStartHour = this.plugin.settings.dayStartHour;
    const all = this.plugin.store.getAllCards();
    const source = this.stateFilter === "trash" ? all.filter((card) => card.trashedAt !== null) : all.filter((card) => card.trashedAt === null);
    const rows: Row[] = source.map((card) => ({
      card,
      model: buildPlantModel(card, now, dayStartHour),
      bed: bedNameFor(card),
    }));

    const dayEnd = logicalDayEnd(now, dayStartHour);

    return rows.filter((row) => {
      if (this.bedFilter !== "all" && row.bed !== this.bedFilter) return false;
      if (this.query !== "") {
        const haystack = `${row.card.title} ${row.card.file} ${anchorLabel(row.card.anchor)}`.toLowerCase();
        if (!haystack.includes(this.query)) return false;
      }
      switch (this.stateFilter) {
        case "due":
          return !row.card.suspended && !row.card.missing && row.card.due < dayEnd;
        case "overdue":
          return !row.card.suspended && !row.card.missing && overdueDays(row.card.due, now, dayStartHour) > 0;
        case "upcoming":
          return !row.card.suspended && !row.card.missing && row.card.due >= dayEnd;
        case "seed":
          return !row.card.suspended && !row.card.missing && row.card.reps === 0;
        case "suspended":
          return row.card.suspended;
        case "missing":
          return row.card.missing;
        case "trash":
          return row.card.trashedAt !== null;
        default:
          return true;
      }
    });
  }

  private renderList(): void {
    if (!this.listEl) return;
    const rows = this.rows();
    const all = this.plugin.store.getAllCards();
    const active = this.plugin.store.getCards();
    const missing = active.filter((card) => card.missing);
    const trashed = all.filter((card) => card.trashedAt !== null);
    const beds = Array.from(new Set(all.map((card) => bedNameFor(card)))).sort((a, b) => {
      if (a === "Vault root") return -1;
      if (b === "Vault root") return 1;
      return a.localeCompare(b);
    });

    const previousBed = this.bedEl.value;
    this.bedEl.empty();
    this.bedEl.createEl("option", { value: "all", text: "Every bed" });
    for (const bed of beds) {
      this.bedEl.createEl("option", { value: bed, text: bed });
    }
    this.bedEl.value = beds.includes(previousBed) ? previousBed : "all";
    if (this.bedEl.value !== previousBed) this.bedFilter = this.bedEl.value;

    const parts = [
      `${rows.length} shown`,
      `${active.length} ${active.length === 1 ? "plant" : "plants"}`,
    ];
    if (missing.length > 0) parts.push(`${missing.length} missing note${missing.length === 1 ? "" : "s"}`);
    if (trashed.length > 0) parts.push(`${trashed.length} in trash`);
    this.countEl.setText(parts.join(" · "));
    this.removeMissingBtn.toggleClass("srg-hidden", missing.length === 0);
    this.emptyTrashBtn.toggleClass("srg-hidden", trashed.length === 0);

    rows.sort((a, b) => {
      if (a.card.trashedAt !== null || b.card.trashedAt !== null) {
        return (b.card.trashedAt ?? 0) - (a.card.trashedAt ?? 0);
      }
      if (a.card.suspended !== b.card.suspended) return a.card.suspended ? 1 : -1;
      if (a.card.due !== b.card.due) return a.card.due - b.card.due;
      return a.card.title.localeCompare(b.card.title);
    });

    this.listEl.empty();
    if (rows.length === 0) {
      this.listEl.createDiv({
        cls: "srg-manage-empty",
        text: this.stateFilter === "trash" ? "The trash is empty." : "No plants match these filters.",
      });
      return;
    }

    for (const row of rows) {
      this.renderRow(row);
    }
  }

  private renderRow(row: Row): void {
    const { card, model } = row;
    const trashed = card.trashedAt !== null;
    const el = this.listEl.createDiv({ cls: "srg-manage-row" });
    if (card.suspended) el.addClass("srg-manage-suspended");
    if (trashed) el.addClass("srg-manage-trashed");

    el.createDiv({ cls: "srg-manage-icon", text: iconFor(model) });

    const main = el.createDiv({ cls: "srg-manage-main" });
    const title = main.createDiv({ cls: "srg-manage-title", text: card.title || card.file });
    title.setAttribute("title", card.title || card.file);
    const status = trashed
      ? `Removed ${removedText(card.trashedAt ?? 0)}`
      : card.suspended
        ? "Suspended"
        : plantStatusText(model);
    main.createDiv({
      cls: "srg-manage-sub",
      text: `${row.bed} · ${card.file} · ${status}`,
    });
    const anchor = main.createDiv({
      cls: "srg-manage-anchor",
      text: anchorLabel(card.anchor),
    });
    anchor.setAttribute("title", anchor.textContent ?? "");

    const actions = el.createDiv({ cls: "srg-manage-actions" });
    if (trashed) {
      const restore = actions.createEl("button", { text: "Restore" });
      restore.addEventListener("click", () => this.plugin.cards.restore(card));
      const remove = actions.createEl("button", { cls: "srg-manage-danger", text: "Delete forever" });
      remove.addEventListener("click", () => this.plugin.cards.deleteForever(card));
      return;
    }

    const review = actions.createEl("button", { text: "Review" });
    review.disabled = card.missing;
    review.title = card.missing ? "This plant is held back until its note comes back." : "Review this plant now";
    review.addEventListener("click", () => this.plugin.openCardReview(card));
    const open = actions.createEl("button", { text: "Open" });
    open.disabled = card.missing;
    open.title = card.missing ? "The note for this plant is missing." : "Open the note";
    open.addEventListener("click", () => this.plugin.cards.openNote(card));
    const more = actions.createEl("button", { text: "More" });
    more.addEventListener("click", (evt) => {
      const menu = new Menu();
      addCardActions(menu, this.plugin, card);
      menu.showAtMouseEvent(evt);
    });
  }
}
