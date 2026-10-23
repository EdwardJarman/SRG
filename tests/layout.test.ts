import { describe, expect, it } from "vitest";
import { createCard } from "../src/core/scheduler";
import { Card } from "../src/core/types";
import {
  BED_COLS,
  BED_GAP,
  BED_PADDING,
  CELL,
  bedNameFor,
  buildGardenLayout,
  emptyGardenLayout,
} from "../src/garden/layout";
import { buildPlantModel } from "../src/garden/plantModel";
import { findPlantAt } from "../src/garden/renderer";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

interface Spec {
  id: string;
  file: string;
  created: number;
}

function makeCard(spec: Spec): Card {
  return createCard({ id: spec.id, file: spec.file, anchor: { type: "note" }, title: spec.id, now: spec.created });
}

function models(specs: Spec[]) {
  return specs.map((spec) => buildPlantModel(makeCard(spec), NOW, HOUR));
}

function positionMap(layout: ReturnType<typeof buildGardenLayout>, excludeId?: string): Array<{
  id: string;
  x: number;
  y: number;
}> {
  return layout.beds[0].plants
    .filter((plant) => plant.model.card.id !== excludeId)
    .map((plant) => ({
      id: plant.model.card.id,
      x: plant.x,
      y: plant.y,
    }));
}

describe("bedNameFor", () => {
  it("uses the vault root or the first path segment", () => {
    expect(bedNameFor(makeCard({ id: "srg-a", file: "Note.md", created: NOW }))).toBe("Vault root");
    expect(bedNameFor(makeCard({ id: "srg-b", file: "Notes/x.md", created: NOW }))).toBe("Notes");
    expect(bedNameFor(makeCard({ id: "srg-c", file: "Notes/deep/x.md", created: NOW }))).toBe("Notes");
  });
});

describe("buildGardenLayout", () => {
  it("returns an empty layout when there are no cards", () => {
    expect(buildGardenLayout([])).toEqual(emptyGardenLayout());
    expect(buildGardenLayout([])).toEqual({ beds: [], width: 1, height: 1 });
  });

  it("orders beds with the vault root first, then alphabetically", () => {
    const layout = buildGardenLayout(
      models([
        { id: "srg-1", file: "Zeta/z.md", created: NOW },
        { id: "srg-2", file: "Notes/a.md", created: NOW },
        { id: "srg-3", file: "Alpha.md", created: NOW },
        { id: "srg-4", file: "Beta/b.md", created: NOW },
      ]),
    );
    expect(layout.beds.map((bed) => bed.name)).toEqual(["Vault root", "Beta", "Notes", "Zeta"]);
  });

  it("is deterministic for the same input", () => {
    const input = models([
      { id: "srg-1", file: "Notes/a.md", created: NOW - 3000 },
      { id: "srg-2", file: "Notes/b.md", created: NOW - 2000 },
      { id: "srg-3", file: "Other/c.md", created: NOW - 1000 },
      { id: "srg-4", file: "Other/d.md", created: NOW },
    ]);
    expect(buildGardenLayout(input)).toEqual(buildGardenLayout(input));
  });

  it("keeps existing plants in place when a plant is appended", () => {
    const original: Spec[] = [
      { id: "srg-a", file: "Notes/a.md", created: NOW - 2000 },
      { id: "srg-b", file: "Notes/b.md", created: NOW - 1000 },
    ];
    const before = buildGardenLayout(models(original));
    const after = buildGardenLayout(models([...original, { id: "srg-c", file: "Notes/c.md", created: NOW }]));

    expect(positionMap(after, "srg-c")).toEqual(positionMap(before));
    expect(after.beds[0].x).toBe(before.beds[0].x);
    expect(after.beds[0].y).toBe(before.beds[0].y);
    expect(after.beds[0].plants).toHaveLength(3);
  });

  it("keeps plants inside their bed and every bed inside the garden", () => {
    const specs: Spec[] = [];
    for (let i = 0; i < 7; i++) specs.push({ id: `srg-${i}`, file: `Notes/n${i}.md`, created: NOW + i });
    for (let i = 0; i < 4; i++) specs.push({ id: `srg-x${i}`, file: `Other/o${i}.md`, created: NOW + 100 + i });
    const layout = buildGardenLayout(models(specs));

    for (const bed of layout.beds) {
      expect(bed.plants.length).toBeGreaterThan(0);
      for (const plant of bed.plants) {
        expect(plant.x).toBeGreaterThanOrEqual(bed.x);
        expect(plant.x).toBeLessThanOrEqual(bed.x + bed.width);
        expect(plant.y).toBeGreaterThanOrEqual(bed.y);
        expect(plant.y).toBeLessThanOrEqual(bed.y + bed.height);
      }
      expect(bed.x + bed.width).toBeLessThanOrEqual(layout.width);
      expect(bed.y + bed.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("wraps beds into new rows without overlapping", () => {
    const specs: Spec[] = [];
    for (let i = 0; i < 12; i++) {
      specs.push({ id: `srg-bed${i}`, file: `Bed${i}/a.md`, created: NOW + i });
    }
    const layout = buildGardenLayout(models(specs));
    expect(layout.beds).toHaveLength(12);
    expect(layout.beds.some((bed) => bed.y > layout.beds[0].y)).toBe(true);

    for (let i = 0; i < layout.beds.length; i++) {
      for (let j = i + 1; j < layout.beds.length; j++) {
        const a = layout.beds[i];
        const b = layout.beds[j];
        const apart =
          a.x + a.width + BED_GAP / 2 <= b.x ||
          b.x + b.width + BED_GAP / 2 <= a.x ||
          a.y + a.height + BED_GAP / 2 <= b.y ||
          b.y + b.height + BED_GAP / 2 <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("flows a bed into extra rows after the column limit", () => {
    const specs: Spec[] = [];
    for (let i = 0; i < BED_COLS + 1; i++) {
      specs.push({ id: `srg-flow${i}`, file: "Notes/deep.md", created: NOW + i });
    }
    const layout = buildGardenLayout(models(specs));
    const bed = layout.beds[0];
    expect(bed.plants).toHaveLength(BED_COLS + 1);
    expect(bed.plants[BED_COLS].y).toBeGreaterThan(bed.plants[0].y + 30);
    expect(bed.width).toBe(BED_PADDING * 2 + BED_COLS * CELL);
  });
});

describe("findPlantAt", () => {
  it("returns the plant under the cursor and null for empty space", () => {
    const layout = buildGardenLayout(
      models([
        { id: "srg-a", file: "Notes/a.md", created: NOW - 1000 },
        { id: "srg-b", file: "Notes/b.md", created: NOW },
      ]),
    );
    const plant = layout.beds[0].plants[0];
    const hit = findPlantAt(layout, plant.x, plant.y - 14);
    expect(hit?.model.card.id).toBe(plant.model.card.id);
    expect(findPlantAt(layout, -400, -400)).toBeNull();
  });

  it("accepts a larger touch radius for coarse pointers", () => {
    const layout = buildGardenLayout(
      models([{ id: "srg-a", file: "Notes/a.md", created: NOW }]),
    );
    const plant = layout.beds[0].plants[0];
    const x = plant.x + 60;
    expect(findPlantAt(layout, x, plant.y, 20)).toBeNull();
    expect(findPlantAt(layout, x, plant.y, 100)?.model.card.id).toBe(plant.model.card.id);
  });
});
