import { describe, expect, it } from "vitest";
import { DAY_MS, dayKeyOffset, logicalDayKey, logicalDayStart } from "../src/core/dates";
import { createCard } from "../src/core/scheduler";
import {
  buildQueue,
  buildQueueForSettings,
  computeRetention,
  computeStats,
  computeStreak,
  countDue,
  overdueDays,
} from "../src/core/stats";
import { Card, DayStats, DEFAULT_SETTINGS } from "../src/core/types";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    ...createCard({ id, file: `Notes/${id}.md`, anchor: { type: "note" }, title: id, now: NOW }),
    ...overrides,
  };
}

describe("logicalDayKey", () => {
  it("rolls the previous day before the day start hour", () => {
    expect(logicalDayKey(new Date(2026, 0, 10, 3, 59).getTime(), HOUR)).toBe("2026-01-09");
    expect(logicalDayKey(new Date(2026, 0, 10, 4, 0).getTime(), HOUR)).toBe("2026-01-10");
    expect(logicalDayKey(NOW, HOUR)).toBe("2026-01-10");
  });
});

describe("countDue", () => {
  it("counts new, due, and overdue cards but not future or suspended ones", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const cards = [
      makeCard("new1"),
      makeCard("due-today", { reps: 1, interval: 1, due: dayStart }),
      makeCard("overdue", { reps: 3, interval: 15, due: dayStart - 2 * DAY_MS }),
      makeCard("later", { reps: 1, interval: 7, due: dayStart + 2 * DAY_MS }),
      makeCard("suspended", { suspended: true, due: 0 }),
    ];
    expect(countDue(cards, NOW, HOUR)).toBe(3);
  });
});

describe("buildQueue", () => {
  it("orders the most overdue reviews first, then adds new cards up to the quota", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const cards = [
      makeCard("new1", { created: NOW - 100 }),
      makeCard("new2", { created: NOW - 50 }),
      makeCard("new3", { created: NOW - 10 }),
      makeCard("due-today", { reps: 2, interval: 6, due: dayStart }),
      makeCard("over-old", { reps: 5, interval: 30, due: dayStart - 3 * DAY_MS }),
    ];
    const queue = buildQueue(cards, NOW, HOUR, 2);
    expect(queue.map((card) => card.id)).toEqual(["over-old", "due-today", "new1", "new2"]);
  });

  it("subtracts cards already introduced today from the new card quota", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const cards = [
      makeCard("introduced", {
        reps: 1,
        interval: 1,
        due: dayStart,
        firstReview: NOW - 3600_000,
      }),
      makeCard("new1", { created: NOW - 10 }),
      makeCard("new2", { created: NOW - 5 }),
    ];
    const queue = buildQueue(cards, NOW, HOUR, 2);
    expect(queue.map((card) => card.id)).toEqual(["introduced", "new1"]);
  });

  it("skips suspended cards", () => {
    const cards = [makeCard("suspended", { suspended: true, reps: 3, due: 0 }), makeCard("new1")];
    const queue = buildQueue(cards, NOW, HOUR, 10);
    expect(queue.map((card) => card.id)).toEqual(["new1"]);
  });
});

describe("computeStreak", () => {
  const key = (offset: number) => dayKeyOffset(NOW, HOUR, offset);

  it("counts consecutive days ending today", () => {
    const daily: Record<string, DayStats> = {};
    for (let offset = 0; offset >= -2; offset--) daily[key(offset)] = { reviews: 1, again: 0 };
    expect(computeStreak(daily, NOW, HOUR)).toBe(3);
  });

  it("keeps the streak alive when today has no reviews yet", () => {
    const daily: Record<string, DayStats> = {
      [key(-1)]: { reviews: 2, again: 0 },
      [key(-2)]: { reviews: 1, again: 0 },
    };
    expect(computeStreak(daily, NOW, HOUR)).toBe(2);
  });

  it("breaks the streak on a gap", () => {
    const daily: Record<string, DayStats> = { [key(-2)]: { reviews: 1, again: 0 } };
    expect(computeStreak(daily, NOW, HOUR)).toBe(0);
  });
});

describe("computeRetention", () => {
  it("returns correct answers over the window", () => {
    const daily: Record<string, DayStats> = {
      [dayKeyOffset(NOW, HOUR, 0)]: { reviews: 6, again: 2 },
      [dayKeyOffset(NOW, HOUR, -1)]: { reviews: 4, again: 0 },
      [dayKeyOffset(NOW, HOUR, -40)]: { reviews: 100, again: 100 },
    };
    expect(computeRetention(daily, 30, NOW, HOUR)).toBeCloseTo(0.8, 10);
  });

  it("returns null when there are no reviews in the window", () => {
    expect(computeRetention({}, 30, NOW, HOUR)).toBeNull();
  });
});

describe("overdueDays", () => {
  it("measures whole days past due", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    expect(overdueDays(dayStart, NOW, HOUR)).toBe(0);
    expect(overdueDays(dayStart - DAY_MS, NOW, HOUR)).toBe(1);
    expect(overdueDays(dayStart - 3 * DAY_MS, NOW, HOUR)).toBe(3);
    expect(overdueDays(dayStart + DAY_MS, NOW, HOUR)).toBe(0);
  });
});

describe("buildQueue with lapsed and missing cards", () => {
  it("brings a lapsed card back even though its reps are zero", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const lapsed = makeCard("lapsed", {
      reps: 0,
      interval: 1,
      due: dayStart - DAY_MS,
      firstReview: NOW - 10 * DAY_MS,
    });
    const queue = buildQueue([lapsed], NOW, HOUR, 5);
    expect(queue.map((card) => card.id)).toEqual(["lapsed"]);
  });

  it("does not let a lapsed card take a slot meant for a new one", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const lapsed = makeCard("lapsed", {
      reps: 0,
      due: dayStart - DAY_MS,
      firstReview: NOW - 10 * DAY_MS,
      created: NOW - 20 * DAY_MS,
    });
    const fresh = makeCard("fresh", { created: NOW - 10 });
    const queue = buildQueue([lapsed, fresh], NOW, HOUR, 1);
    expect(queue.map((card) => card.id)).toEqual(["lapsed", "fresh"]);
  });

  it("leaves out plants whose note is missing or whose anchor is orphaned", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const missing = makeCard("missing", { reps: 3, due: dayStart, missing: true });
    const orphaned = makeCard("orphaned", { reps: 3, due: dayStart, orphaned: true });
    expect(buildQueue([missing, orphaned], NOW, HOUR, 5)).toHaveLength(0);
    expect(countDue([missing, orphaned], NOW, HOUR)).toBe(0);
  });

  it("leaves out trashed plants everywhere", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const trashed = makeCard("trashed", { reps: 3, due: dayStart, trashedAt: NOW });
    expect(buildQueue([trashed], NOW, HOUR, 5)).toHaveLength(0);
    expect(countDue([trashed], NOW, HOUR)).toBe(0);
    const stats = computeStats([trashed], {}, NOW, DEFAULT_SETTINGS);
    expect(stats.due).toBe(0);
    expect(stats.newCards).toBe(0);
  });

  it("treats a reset plant as a fresh seed again", () => {
    const reset = makeCard("reset", {
      reps: 0,
      interval: 0,
      ease: 2.5,
      due: NOW,
      firstReview: null,
    });
    const stats = computeStats([reset], {}, NOW, { ...DEFAULT_SETTINGS, dayStartHour: HOUR });
    expect(stats.newCards).toBe(1);
    expect(buildQueue([reset], NOW, HOUR, 1).map((card) => card.id)).toEqual(["reset"]);
  });

  it("buildQueueForSettings matches the queue built from its settings", () => {
    const dayStart = logicalDayStart(NOW, HOUR);
    const cards = [
      makeCard("due", { reps: 1, due: dayStart }),
      makeCard("new1", { created: NOW - 10 }),
      makeCard("new2", { created: NOW - 5 }),
    ];
    const settings = { ...DEFAULT_SETTINGS, dayStartHour: HOUR, newCardsPerDay: 1 };
    expect(buildQueueForSettings(cards, NOW, settings).map((card) => card.id)).toEqual([
      "due",
      "new1",
    ]);
  });
});
