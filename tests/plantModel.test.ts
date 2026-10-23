import { describe, expect, it } from "vitest";
import { DAY_MS, logicalDayStart } from "../src/core/dates";
import { createCard } from "../src/core/scheduler";
import { Card } from "../src/core/types";
import { buildPlantModel, cardCondition, cardStage, plantStatusText } from "../src/garden/plantModel";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();
const DAY_START = logicalDayStart(NOW, HOUR);

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard({ id: "srg-aaaaaaaa", file: "Notes/a.md", anchor: { type: "note" }, title: "A", now: NOW }),
    ...overrides,
  };
}

describe("cardStage", () => {
  it("grows a plant through its stages as reps increase", () => {
    expect(cardStage(makeCard({ reps: 0 }))).toBe("seed");
    expect(cardStage(makeCard({ reps: 1 }))).toBe("sprout");
    expect(cardStage(makeCard({ reps: 2 }))).toBe("growing");
    expect(cardStage(makeCard({ reps: 3 }))).toBe("growing");
    expect(cardStage(makeCard({ reps: 4 }))).toBe("established");
    expect(cardStage(makeCard({ reps: 40 }))).toBe("established");
  });
});

describe("cardCondition", () => {
  it("wilts when overdue and counts the late days", () => {
    const result = cardCondition(makeCard({ reps: 3, due: DAY_START - 3 * DAY_MS }), NOW, HOUR);
    expect(result.condition).toBe("wilting");
    expect(result.overdueDays).toBe(3);
    expect(result.daysUntilDue).toBe(-3);
  });

  it("blooms when due today or tomorrow", () => {
    const today = cardCondition(makeCard({ due: DAY_START }), NOW, HOUR);
    expect(today.condition).toBe("blooming");
    expect(today.daysUntilDue).toBe(0);
    expect(today.overdueDays).toBe(0);

    const tomorrow = cardCondition(makeCard({ due: DAY_START + DAY_MS }), NOW, HOUR);
    expect(tomorrow.condition).toBe("blooming");
    expect(tomorrow.daysUntilDue).toBe(1);
  });

  it("stays healthy when due further ahead", () => {
    const result = cardCondition(makeCard({ reps: 2, due: DAY_START + 5 * DAY_MS }), NOW, HOUR);
    expect(result.condition).toBe("healthy");
    expect(result.daysUntilDue).toBe(5);
    expect(result.overdueDays).toBe(0);
  });

  it("measures days from the configured day start hour", () => {
    const earlyMorning = new Date(2026, 0, 11, 3, 0, 0).getTime();
    const result = cardCondition(makeCard({ due: DAY_START }), earlyMorning, HOUR);
    expect(result.condition).toBe("blooming");
    expect(result.daysUntilDue).toBe(0);
  });

  it("marks missing notes before any wilting or blooming state", () => {
    const result = cardCondition(
      makeCard({ reps: 8, due: DAY_START - 5 * DAY_MS, missing: true }),
      NOW,
      HOUR,
    );
    expect(result.condition).toBe("missing");
    expect(result.overdueDays).toBe(0);
  });
});

describe("buildPlantModel", () => {
  it("is deterministic for the same card and time", () => {
    const card = makeCard({ reps: 5, due: DAY_START + 3 * DAY_MS });
    expect(buildPlantModel(card, NOW, HOUR)).toEqual(buildPlantModel(card, NOW, HOUR));
  });

  it("derives stable visual attributes from the card id", () => {
    const first = buildPlantModel(makeCard(), NOW, HOUR);
    const second = buildPlantModel(makeCard(), NOW, HOUR);
    expect(first.hue).toBe(second.hue);
    expect(first.size).toBe(second.size);
    expect(first.swayPhase).toBe(second.swayPhase);
    expect(first.swaySpeed).toBe(second.swaySpeed);
    expect(first.hue).toBeGreaterThanOrEqual(0);
    expect(first.hue).toBeLessThan(360);
    expect(first.size).toBeGreaterThanOrEqual(0.8);
    expect(first.size).toBeLessThanOrEqual(1.25);
  });

  it("combines stage and condition from the card", () => {
    const model = buildPlantModel(makeCard({ reps: 6, due: DAY_START - 2 * DAY_MS }), NOW, HOUR);
    expect(model.stage).toBe("established");
    expect(model.condition).toBe("wilting");
    expect(model.overdueDays).toBe(2);
  });
});

describe("plantStatusText", () => {
  it("describes a fresh seed", () => {
    const ready = buildPlantModel(makeCard({ reps: 0, due: DAY_START }), NOW, HOUR);
    expect(plantStatusText(ready)).toBe("Seed - ready to plant");

    const waiting = buildPlantModel(makeCard({ reps: 0, due: DAY_START + 3 * DAY_MS }), NOW, HOUR);
    expect(plantStatusText(waiting)).toBe("Seed - due in 3d");
  });

  it("describes missing notes as held back", () => {
    const missing = buildPlantModel(makeCard({ reps: 6, missing: true }), NOW, HOUR);
    expect(plantStatusText(missing)).toBe("Note missing - held back");
  });

  it("describes wilting, blooming and healthy plants", () => {
    const wilting = buildPlantModel(makeCard({ reps: 6, due: DAY_START - 4 * DAY_MS }), NOW, HOUR);
    expect(plantStatusText(wilting)).toBe("Established - Wilting - 4d overdue");

    const blooming = buildPlantModel(makeCard({ reps: 1, due: DAY_START }), NOW, HOUR);
    expect(plantStatusText(blooming)).toBe("Sprout - Blooming - due today");

    const healthy = buildPlantModel(makeCard({ reps: 2, due: DAY_START + 7 * DAY_MS }), NOW, HOUR);
    expect(plantStatusText(healthy)).toBe("Growing - Due in 7d");
  });
});
