import { describe, expect, it } from "vitest";
import { DAY_MS, logicalDayStart } from "../src/core/dates";
import {
  applyReview,
  createCard,
  fuzzInterval,
  INITIAL_EASE,
  MAX_EASE,
  MIN_EASE,
  previewIntervals,
} from "../src/core/scheduler";
import { Card, Grade } from "../src/core/types";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function fresh(): Card {
  return createCard({
    id: "srg-test0001",
    file: "Notes/Biology.md",
    anchor: { type: "note" },
    title: "Biology",
    now: NOW,
  });
}

function grade(card: Card, g: Grade, now: number = NOW, fuzz = false): Card {
  return applyReview(card, g, { now, dayStartHour: HOUR, fuzz });
}

describe("createCard", () => {
  it("starts as an immediately due seed with the initial ease factor", () => {
    const card = fresh();
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.ease).toBe(INITIAL_EASE);
    expect(card.due).toBe(NOW);
    expect(card.lastReview).toBeNull();
    expect(card.firstReview).toBeNull();
    expect(card.suspended).toBe(false);
  });
});

describe("applyReview - SM-2 progression", () => {
  it("Good goes 1 day, then 6 days, then interval x ease", () => {
    let card = grade(fresh(), 4);
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(card.ease).toBe(2.5);
    expect(card.due).toBe(logicalDayStart(NOW, HOUR) + DAY_MS);

    card = grade(card, 4);
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(6);

    card = grade(card, 4);
    expect(card.reps).toBe(3);
    expect(card.interval).toBe(15);
    expect(card.ease).toBe(2.5);
  });

  it("Easy raises the ease factor while Good leaves it unchanged", () => {
    expect(grade(fresh(), 5).ease).toBeCloseTo(2.6, 10);
    expect(grade(fresh(), 4).ease).toBe(2.5);
  });

  it("Hard grows a mature card by 1.2x instead of the ease factor", () => {
    let card = grade(fresh(), 4);
    card = grade(card, 4);
    card = grade(card, 4);
    expect(card.interval).toBe(15);

    card = grade(card, 3);
    expect(card.reps).toBe(4);
    expect(card.interval).toBe(18);

    card = grade(card, 3);
    expect(card.interval).toBe(22);
  });

  it("Again resets repetitions, counts a lapse, and lowers the ease factor by 0.54", () => {
    let card = grade(fresh(), 4);
    card = grade(card, 4);
    card = grade(card, 4);

    const lapsed = grade(card, 1);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.interval).toBe(1);
    expect(lapsed.ease).toBeCloseTo(2.5 - 0.54, 10);
    expect(lapsed.due).toBe(logicalDayStart(NOW, HOUR) + DAY_MS);
  });

  it("clamps the ease factor between 1.3 and 2.8", () => {
    let card = fresh();
    for (let i = 0; i < 20; i++) card = grade(card, 1);
    expect(card.ease).toBe(MIN_EASE);

    card = fresh();
    for (let i = 0; i < 20; i++) card = grade(card, 5);
    expect(card.ease).toBe(MAX_EASE);
  });

  it("sets firstReview once and updates lastReview on every review", () => {
    const first = grade(fresh(), 4, NOW);
    expect(first.firstReview).toBe(NOW);

    const later = NOW + 3 * DAY_MS;
    const second = grade(first, 4, later);
    expect(second.firstReview).toBe(NOW);
    expect(second.lastReview).toBe(later);
  });

  it("reviews before the day boundary belong to the previous logical day", () => {
    const night = new Date(2026, 0, 10, 2, 0, 0).getTime();
    const card = applyReview(fresh(), 4, { now: night, dayStartHour: HOUR, fuzz: false });
    expect(card.due).toBe(new Date(2026, 0, 10, 4, 0, 0).getTime());
  });

  it("does not mutate the input card", () => {
    const card = fresh();
    const before = JSON.stringify(card);
    grade(card, 4);
    expect(JSON.stringify(card)).toBe(before);
  });
});

describe("fuzz", () => {
  it("is deterministic and stays within 5 percent", () => {
    const a = fuzzInterval("srg-fuzz0001", 100);
    const b = fuzzInterval("srg-fuzz0001", 100);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(95);
    expect(a).toBeLessThanOrEqual(105);
  });

  it("is applied only when enabled", () => {
    let mature = grade(fresh(), 4);
    mature = grade(mature, 4);
    mature = grade(mature, 4);

    const withFuzz = applyReview(mature, 4, { now: NOW, dayStartHour: HOUR, fuzz: true });
    const exact = applyReview(mature, 4, { now: NOW, dayStartHour: HOUR, fuzz: false });
    expect(exact.interval).toBe(38);
    expect(withFuzz.interval).toBe(fuzzInterval(mature.id, 38));
  });
});

describe("previewIntervals", () => {
  it("previews the next interval for every grade", () => {
    const freshPreviews = previewIntervals(fresh(), NOW, HOUR);
    expect(Object.keys(freshPreviews)).toHaveLength(4);
    expect(freshPreviews[1]).toBe(1);
    expect(freshPreviews[3]).toBe(1);
    expect(freshPreviews[4]).toBe(1);
    expect(freshPreviews[5]).toBe(1);

    let mature = grade(fresh(), 4);
    mature = grade(mature, 4);
    mature = grade(mature, 4);
    const previews = previewIntervals(mature, NOW, HOUR);
    expect(previews[1]).toBe(1);
    expect(previews[3]).toBe(18);
    expect(previews[4]).toBe(38);
    expect(previews[5]).toBe(38);
  });
});
