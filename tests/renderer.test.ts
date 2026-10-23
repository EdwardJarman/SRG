import { describe, expect, it } from "vitest";
import { createCard } from "../src/core/scheduler";
import { buildGardenLayout } from "../src/garden/layout";
import { buildPlantModel, PlantModel } from "../src/garden/plantModel";
import { paletteForTheme, renderGarden } from "../src/garden/renderer";
import { fakeCanvasContext } from "./helpers/fakeCanvas";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function model(id: string, missing: boolean): PlantModel {
  return buildPlantModel(
    {
      ...createCard({
        id,
        file: `Notes/${id}.md`,
        anchor: { type: "note" },
        title: id,
        now: NOW,
      }),
      missing,
    },
    NOW,
    HOUR,
  );
}

describe("renderGarden missing plants", () => {
  it("draws held-back plants with the missing palette", () => {
    const palette = paletteForTheme(false);
    const layout = buildGardenLayout([model("srg-a", true), model("srg-b", false)]);
    const { ctx, calls } = fakeCanvasContext();

    renderGarden(ctx, {
      layout,
      palette,
      width: 800,
      height: 600,
      panX: 0,
      panY: 0,
      zoom: 1,
      hoverId: null,
      timeMs: 0,
      reduceMotion: true,
    });

    const values = calls.filter((call) => call.kind === "set").map((call) => call.value);
    expect(values).toContain(palette.missingStem);
    expect(values).toContain(palette.missingLeaf);
    expect(values).toContain(palette.missingHalo);
    expect(values).toContain(palette.missingMark);
  });
});
