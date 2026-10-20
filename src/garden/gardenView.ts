import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import { computeStats } from "../core/stats";
import type SpacedRepetitionGardenPlugin from "../main";
import {
  buildGardenLayout,
  emptyGardenLayout,
  GardenLayout,
  PlacedPlant,
} from "./layout";
import { buildPlantModel, PlantModel, plantStatusText } from "./plantModel";
import { addCardActions } from "./cardMenu";
import { findPlantAt, GardenPalette, paletteForTheme, renderGarden } from "./renderer";

export const GARDEN_VIEW_TYPE = "spaced-repetition-garden-view";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const CLICK_SLOP = 4;

export class GardenView extends ItemView {
  private readonly plugin: SpacedRepetitionGardenPlugin;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tooltipEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private dueChipEl: HTMLElement | null = null;
  private streakChipEl: HTMLElement | null = null;
  private retentionChipEl: HTMLElement | null = null;
  private reviewBtn: HTMLButtonElement | null = null;
  private manageBtn: HTMLButtonElement | null = null;

  private layout: GardenLayout = emptyGardenLayout();
  private models: PlantModel[] = [];
  private hover: PlacedPlant | null = null;
  private palette: GardenPalette = paletteForTheme(false);
  private reduceMotion = false;

  private pan = { x: 0, y: 0 };
  private zoom = 1;
  private userMoved = false;

  private raf = 0;
  private clockTimer: number | null = null;
  private needsRender = true;
  private unsubscribe: (() => void) | null = null;

  private pointerActive = false;
  private pointerDragged = false;
  private lastPointer = { x: 0, y: 0 };
  private downAt = { x: 0, y: 0 };

  constructor(leaf: WorkspaceLeaf, plugin: SpacedRepetitionGardenPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return GARDEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Garden";
  }

  getIcon(): string {
    return "sprout";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("srg-garden-root");

    const hud = root.createDiv({ cls: "srg-garden-hud" });
    hud.createDiv({ cls: "srg-garden-title", text: "Garden" });
    const chips = hud.createDiv({ cls: "srg-garden-chips" });
    this.dueChipEl = chips.createSpan({ cls: "srg-chip" });
    this.streakChipEl = chips.createSpan({ cls: "srg-chip" });
    this.retentionChipEl = chips.createSpan({ cls: "srg-chip" });
    this.reviewBtn = hud.createEl("button", { cls: "srg-garden-review mod-cta", text: "Review due" });
    this.registerDomEvent(this.reviewBtn, "click", () => this.plugin.openReviewDue());
    this.manageBtn = hud.createEl("button", { cls: "srg-garden-manage", text: "Manage" });
    this.registerDomEvent(this.manageBtn, "click", () => void this.plugin.openManage());

    const wrap = root.createDiv({ cls: "srg-garden-canvas-wrap" });
    this.emptyEl = wrap.createDiv({ cls: "srg-garden-empty srg-hidden" });
    this.emptyEl.createDiv({
      cls: "srg-garden-empty-title",
      text: "Your garden is empty.",
    });
    this.emptyEl.createDiv({
      cls: "srg-garden-empty-sub",
      text: "Select text in a note and run Plant flashcard, or use the command palette.",
    });
    this.canvas = wrap.createEl("canvas", { cls: "srg-garden-canvas" });
    this.tooltipEl = wrap.createDiv({ cls: "srg-garden-tooltip srg-hidden" });
    this.ctx = this.canvas.getContext("2d");

    this.reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.palette = paletteForTheme(document.body.classList.contains("theme-dark"));

    if (this.canvas) {
      this.registerDomEvent(this.canvas, "pointerdown", this.onPointerDown);
      this.registerDomEvent(this.canvas, "pointermove", this.onPointerMove);
      this.registerDomEvent(this.canvas, "pointerup", this.onPointerUp);
      this.registerDomEvent(this.canvas, "pointercancel", this.onPointerCancel);
      this.registerDomEvent(this.canvas, "pointerleave", this.onPointerLeave);
      this.registerDomEvent(this.canvas, "contextmenu", this.onContextMenu);
      this.registerDomEvent(this.canvas, "wheel", this.onWheel, { passive: false });
    }
    this.registerEvent(this.app.workspace.on("resize", this.onWorkspaceResize));
    this.registerEvent(this.app.workspace.on("css-change", this.onCssChange));

    this.unsubscribe = this.plugin.store.onChange(() => this.recompute());
    this.clockTimer = window.setInterval(() => this.recompute(), 5 * 60 * 1000);

    this.recompute();
    this.raf = requestAnimationFrame(this.tick);
  }

  async onClose(): Promise<void> {
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.clockTimer !== null) {
      window.clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.tooltipEl = null;
    this.emptyEl = null;
    this.reviewBtn = null;
  }

  recompute(): void {
    const now = Date.now();
    const settings = this.plugin.settings;
    this.models = this.plugin.store
      .getCards()
      .map((card) => buildPlantModel(card, now, settings.dayStartHour));
    this.layout = buildGardenLayout(this.models);

    if (this.hover) {
      const hoverId = this.hover.model.card.id;
      const stillThere = this.layout.beds.some((bed) =>
        bed.plants.some((plant) => plant.model.card.id === hoverId),
      );
      if (!stillThere) {
        this.hover = null;
        this.hideTooltip();
      }
    }

    this.updateHud();
    if (!this.userMoved) this.fitToView();
    this.needsRender = true;
  }

  onResize(): void {
    this.needsRender = true;
    if (!this.userMoved) this.fitToView();
  }

  private updateHud(): void {
    const stats = computeStats(
      this.plugin.store.getCards(),
      this.plugin.store.getData().daily,
      Date.now(),
      this.plugin.settings,
    );
    if (this.dueChipEl) {
      this.dueChipEl.setText(stats.due === 0 ? "All clear" : `${stats.due} due`);
      this.dueChipEl.setAttribute("data-tone", stats.due === 0 ? "calm" : "due");
    }
    if (this.streakChipEl) this.streakChipEl.setText(`${stats.streak}d streak`);
    if (this.retentionChipEl) {
      this.retentionChipEl.setText(
        stats.retention === null ? "No retention yet" : `${Math.round(stats.retention * 100)}% retention`,
      );
    }
    if (this.reviewBtn) {
      this.reviewBtn.setText(stats.due === 0 ? "Nothing due" : `Review ${stats.due}`);
      this.reviewBtn.disabled = stats.due === 0;
    }
    if (this.emptyEl) {
      if (this.models.length === 0) this.emptyEl.removeClass("srg-hidden");
      else this.emptyEl.addClass("srg-hidden");
    }
  }

  private fitToView(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    const fit = Math.min((width - 48) / this.layout.width, (height - 48) / this.layout.height);
    this.zoom = Math.min(1, Math.max(MIN_ZOOM, fit));
    this.pan.x = (width - this.layout.width * this.zoom) / 2;
    this.pan.y = (height - this.layout.height * this.zoom) / 2;
    this.needsRender = true;
  }

  private tick = (timeMs: number): void => {
    this.raf = 0;
    const canvas = this.canvas;
    if (canvas) {
      const hidden = document.hidden || canvas.offsetParent === null || canvas.clientWidth === 0;
      const animate = !this.reduceMotion && this.models.length > 0;
      if (!hidden && (this.needsRender || animate)) {
        this.draw(timeMs);
        this.needsRender = false;
      }
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private draw(timeMs: number): void {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderGarden(ctx, {
      layout: this.layout,
      palette: this.palette,
      width: cssWidth,
      height: cssHeight,
      panX: this.pan.x,
      panY: this.pan.y,
      zoom: this.zoom,
      hoverId: this.hover ? this.hover.model.card.id : null,
      timeMs,
      reduceMotion: this.reduceMotion,
    });
  }

  private toWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.pan.x) / this.zoom, y: (y - this.pan.y) / this.zoom };
  }

  private onPointerDown = (evt: PointerEvent): void => {
    if (evt.button !== 0) return;
    this.pointerActive = true;
    this.pointerDragged = false;
    this.lastPointer = { x: evt.offsetX, y: evt.offsetY };
    this.downAt = { x: evt.offsetX, y: evt.offsetY };
    if (this.canvas) {
      this.canvas.style.cursor = "grabbing";
      try {
        this.canvas.setPointerCapture(evt.pointerId);
      } catch {
        // Pointer capture is a nicety; dragging still works without it.
      }
    }
  };

  private onPointerMove = (evt: PointerEvent): void => {
    const x = evt.offsetX;
    const y = evt.offsetY;
    if (this.pointerActive) {
      const dx = x - this.lastPointer.x;
      const dy = y - this.lastPointer.y;
      if (!this.pointerDragged) {
        const moved = Math.abs(x - this.downAt.x) + Math.abs(y - this.downAt.y);
        if (moved > CLICK_SLOP) {
          this.pointerDragged = true;
          this.hideTooltip();
        }
      }
      if (this.pointerDragged) {
        this.pan.x += dx;
        this.pan.y += dy;
        this.userMoved = true;
        this.needsRender = true;
      }
      this.lastPointer = { x, y };
      return;
    }
    this.updateHover(x, y);
  };

  private onPointerUp = (evt: PointerEvent): void => {
    const clicked = this.pointerActive && !this.pointerDragged;
    this.pointerActive = false;
    if (this.canvas) {
      this.setCanvasCursor(this.hover !== null);
      try {
        this.canvas.releasePointerCapture(evt.pointerId);
      } catch {
        // Already released.
      }
    }
    if (clicked) this.handleClick(evt.offsetX, evt.offsetY);
  };

  private onPointerCancel = (): void => {
    this.pointerActive = false;
    this.pointerDragged = false;
    this.setCanvasCursor(this.hover !== null);
  };

  private onPointerLeave = (): void => {
    if (this.pointerActive) return;
    if (this.hover) {
      this.hover = null;
      this.hideTooltip();
      this.needsRender = true;
    }
  };

  private onWheel = (evt: WheelEvent): void => {
    const canvas = this.canvas;
    if (!canvas) return;
    evt.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;
    const factor = Math.exp(-evt.deltaY * 0.0016);
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    if (next === this.zoom) return;
    const worldX = (px - this.pan.x) / this.zoom;
    const worldY = (py - this.pan.y) / this.zoom;
    this.zoom = next;
    this.pan.x = px - worldX * next;
    this.pan.y = py - worldY * next;
    this.userMoved = true;
    this.needsRender = true;
    this.repositionTooltip();
  };

  private onContextMenu = (evt: MouseEvent): void => {
    evt.preventDefault();
    const world = this.toWorld(evt.offsetX, evt.offsetY);
    const plant = findPlantAt(this.layout, world.x, world.y);
    if (!plant) return;
    const menu = new Menu();
    addCardActions(menu, this.plugin, plant.model.card);
    menu.showAtMouseEvent(evt);
  };

  private onWorkspaceResize = (): void => {
    this.needsRender = true;
    if (!this.userMoved) this.fitToView();
    this.repositionTooltip();
  };

  private onCssChange = (): void => {
    this.palette = paletteForTheme(document.body.classList.contains("theme-dark"));
    this.needsRender = true;
  };

  private updateHover(x: number, y: number): void {
    const world = this.toWorld(x, y);
    const plant = findPlantAt(this.layout, world.x, world.y);
    const previousId = this.hover ? this.hover.model.card.id : null;
    const nextId = plant ? plant.model.card.id : null;
    if (previousId !== nextId) {
      this.hover = plant;
      this.needsRender = true;
      if (plant) this.showTooltip(plant);
      else this.hideTooltip();
      this.setCanvasCursor(plant !== null);
      return;
    }
    if (plant) this.repositionTooltip();
  }

  private handleClick(x: number, y: number): void {
    const world = this.toWorld(x, y);
    const plant = findPlantAt(this.layout, world.x, world.y);
    if (plant) void this.plugin.openCardReview(plant.model.card);
  }

  private setCanvasCursor(pointer: boolean): void {
    if (this.canvas) this.canvas.style.cursor = pointer ? "pointer" : "grab";
  }

  private showTooltip(plant: PlacedPlant): void {
    const tip = this.tooltipEl;
    if (!tip) return;
    const model = plant.model;
    tip.empty();
    tip.createDiv({ cls: "srg-tooltip-title", text: model.card.title || model.card.file });
    tip.createDiv({ cls: "srg-tooltip-sub", text: plantStatusText(model) });
    tip.createDiv({ cls: "srg-tooltip-file", text: model.card.file });
    tip.removeClass("srg-hidden");
    this.repositionTooltip();
  }

  private hideTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.addClass("srg-hidden");
  }

  private repositionTooltip(): void {
    const tip = this.tooltipEl;
    const canvas = this.canvas;
    if (!tip || !canvas || !this.hover || tip.hasClass("srg-hidden")) return;
    const screenX = this.hover.x * this.zoom + this.pan.x;
    const screenY = (this.hover.y - 50) * this.zoom + this.pan.y;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const left = Math.max(8, Math.min(canvas.clientWidth - tipWidth - 8, screenX - tipWidth / 2));
    const top = Math.max(8, screenY - tipHeight);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
}
