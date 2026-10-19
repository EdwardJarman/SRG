import { Card } from "../core/types";
import { mulberry32 } from "../utils/random";
import { PlantModel } from "./plantModel";

export const CELL = 76;
export const BED_PADDING = 26;
export const BED_GAP = 40;
export const MAX_ROW_WIDTH = 1500;
export const MARGIN = 28;
export const BED_COLS = 5;
export const BED_LABEL_H = 30;

export interface PlacedPlant {
  model: PlantModel;
  x: number;
  y: number;
  radius: number;
}

export interface BedLayout {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  plants: PlacedPlant[];
}

export interface GardenLayout {
  beds: BedLayout[];
  width: number;
  height: number;
}

export function emptyGardenLayout(): GardenLayout {
  return { beds: [], width: 1, height: 1 };
}

export function bedNameFor(card: Card): string {
  const slash = card.file.indexOf("/");
  return slash === -1 ? "Vault root" : card.file.slice(0, slash);
}

export function buildGardenLayout(models: PlantModel[]): GardenLayout {
  if (models.length === 0) return emptyGardenLayout();

  const groups = new Map<string, PlantModel[]>();
  for (const model of models) {
    const bed = bedNameFor(model.card);
    const list = groups.get(bed);
    if (list) list.push(model);
    else groups.set(bed, [model]);
  }

  const names = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Vault root") return -1;
    if (b === "Vault root") return 1;
    return a.localeCompare(b);
  });

  const beds: BedLayout[] = [];
  let cursorX = MARGIN;
  let cursorY = MARGIN;
  let rowHeight = 0;
  let contentWidth = 0;

  for (const name of names) {
    const group = groups.get(name) ?? [];
    const usedCols = Math.min(BED_COLS, Math.max(1, group.length));
    const rows = Math.max(1, Math.ceil(group.length / BED_COLS));
    const width = BED_PADDING * 2 + usedCols * CELL;
    const height = BED_LABEL_H + rows * CELL + BED_PADDING;

    if (beds.length > 0 && cursorX + width > MAX_ROW_WIDTH) {
      cursorX = MARGIN;
      cursorY += rowHeight + BED_GAP;
      rowHeight = 0;
    }

    const originX = cursorX + BED_PADDING;
    const originY = cursorY + BED_LABEL_H;
    const plants = placePlants(group).map((plant) => ({
      ...plant,
      x: originX + plant.x,
      y: originY + plant.y,
    }));

    beds.push({ name, x: cursorX, y: cursorY, width, height, plants });
    cursorX += width + BED_GAP;
    rowHeight = Math.max(rowHeight, height);
    contentWidth = Math.max(contentWidth, cursorX - BED_GAP);
  }

  return {
    beds,
    width: Math.max(1, contentWidth + MARGIN),
    height: Math.max(1, cursorY + rowHeight + MARGIN),
  };
}

function placePlants(models: PlantModel[]): PlacedPlant[] {
  const sorted = [...models].sort(
    (a, b) => a.card.created - b.card.created || a.card.id.localeCompare(b.card.id),
  );
  return sorted.map((model, index) => {
    const rng = mulberry32(model.seed ^ 0x9e3779b9);
    const col = index % BED_COLS;
    const row = Math.floor(index / BED_COLS);
    const jitterX = (rng() - 0.5) * 16;
    const jitterY = (rng() - 0.5) * 16;
    return {
      model,
      x: col * CELL + CELL / 2 + jitterX,
      y: row * CELL + CELL * 0.62 + jitterY,
      radius: CELL * 0.42,
    };
  });
}
