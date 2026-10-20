import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import { logicalDayEnd } from "../core/dates";
import { overdueDays } from "../core/stats";
import { Card } from "../core/types";
import type SpacedRepetitionGardenPlugin from "../main";
import { addCardActions } from "./cardMenu";
import { bedNameFor } from "./layout";
import { buildPlantModel, PlantModel, PlantStage, plantStatusText } from "./plantModel";

export const MANAGE_VIEW_TYPE = "spaced-repetition-garden-manage";

type StateFilter = "all" | "due" | "overdue" | "upcoming" | "seed" | "suspended";

const STATE_FILTERS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "Every plant" },
  { value: "due", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Still resting" },
  { value: "seed", label: "Seeds" },
  { value: "suspended", label: "Suspended" },
];

const STAGE_ICONS: Record<PlantStage, string> = {
  seed: "🌰",
  sprout: "🌱",
  growing: "🌿",
  established: "🌻",
};

function iconFor(model: PlantModel): string {
  if (model.condition === "wilting") return "🥀";
  if (model.condition === "blooming") return "🌸";
  return STAGE_ICONS[model.stage];
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
    const cards = this.plugin.store.getCards();
    const rows: Row[] = cards.map((card) => ({
      card,
      model: buildPlantModel(card, now, dayStartHour),
      bed: bedNameFor(card),
    }));

    const dayEnd = logicalDayEnd(now, dayStartHour);

    return rows.filter((row) => {      if (this.bedFilter !== "all" && row.bed !== this.bedFilter) return false;
      if (this.query !== "") {
        const haystack = `${row.card.title} ${row.card.file}`.toLowerCase();
        if (!haystack.includes(this.query)) return false;
      }
      switch (this.stateFilter) {
        case "due":
          return !row.card.suspended && row.card.due < dayEnd;
        case "overdue":
          return !row.card.suspended && overdueDays(row.card.due, now, dayStartHour) > 0;
        case "upcoming":
          return !row.card.suspended && row.card.due >= dayEnd;
        case "seed":
          return !row.card.suspended && row.card.reps === 0;
        case "suspended":
          return row.card.suspended;
        default:
          return true;
      }
    });
  }

  private renderList(): void {
    if (!this.listEl) return;
    const rows = this.rows();
    const cards = this.plugin.store.getCards();
    const beds = Array.from(new Set(cards.map((card) => bedNameFor(card)))).sort((a, b) => {
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

    const total = cards.length;
    const suspended = cards.filter((card) => card.suspended).length;
    this.countEl.setText(
      `${rows.length} of ${total} ${total === 1 ? "plant" : "plants"}${
        suspended > 0 ? ` · ${suspended} suspended` : ""
      }`,
    );

    rows.sort((a, b) => {
      if (a.card.suspended !== b.card.suspended) return a.card.suspended ? 1 : -1;
      if (a.card.due !== b.card.due) return a.card.due - b.card.due;
      return a.card.title.localeCompare(b.card.title);
    });

    this.listEl.empty();
    if (rows.length === 0) {
      this.listEl.createDiv({
        cls: "srg-manage-empty",
        text: "No plants match these filters.",
      });
      return;
    }

    for (const row of rows) {
      this.renderRow(row);
    }
  }

  private renderRow(row: Row): void {
    const { card, model } = row;
    const el = this.listEl.createDiv({ cls: "srg-manage-row" });
    if (card.suspended) el.addClass("srg-manage-suspended");

    el.createDiv({ cls: "srg-manage-icon", text: iconFor(model) });

    const main = el.createDiv({ cls: "srg-manage-main" });
    main.createDiv({ cls: "srg-manage-title", text: card.title || card.file });
    main.createDiv({
      cls: "srg-manage-sub",
      text: card.suspended
        ? `${row.bed} · ${card.file} · Suspended`
        : `${row.bed} · ${card.file} · ${plantStatusText(model)}`,
    });

    const actions = el.createDiv({ cls: "srg-manage-actions" });
    const review = actions.createEl("button", { text: "Review" });
    review.addEventListener("click", () => this.plugin.openCardReview(card));
    const open = actions.createEl("button", { text: "Open" });
    open.addEventListener("click", () => this.plugin.openCardNote(card));
    const more = actions.createEl("button", { text: "More" });
    more.addEventListener("click", (evt) => {
      const menu = new Menu();
      addCardActions(menu, this.plugin, card);
      menu.showAtMouseEvent(evt);
    });
  }
}
