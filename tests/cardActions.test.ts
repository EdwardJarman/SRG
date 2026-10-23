import { describe, expect, it } from "vitest";
import {
  postponeCard,
  rescheduleCard,
  resetCard,
  resumeCard,
  suspendCard,
  toggleSuspended,
} from "../src/core/cardActions";
import { DAY_MS, logicalDayStart } from "../src/core/dates";
import { INITIAL_EASE } from "../src/core/scheduler";
import { countDue } from "../src/core/stats";
import { Card } from "../src/core/types";

const HOUR = 4;
const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();
const DAY_START = logicalDayStart(NOW, HOUR);

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "srg-aaaaaaaa",
    file: "Notes/a.md",
    anchor: { type: "note" },
    title: "A",
    created: NOW - 5 * DAY_MS,
    reps: 4,
    lapses: 1,
    interval: 21,
    ease: 2.5,
    due: DAY_START + 3 * DAY_MS,
    lastReview: NOW - DAY_MS,
    firstReview: NOW - 5 * DAY_MS,
    suspended: false,
    missing: false,
    orphaned: false,
    trashedAt: null,
    updatedAt: NOW - DAY_MS,
    ...overrides,
  };
}

describe("suspend and resume", () => {
  it("flips the suspended flag without touching the schedule", () => {
    const card = makeCard();
    const suspended = suspendCard(card, NOW);
    expect(suspended.suspended).toBe(true);
    expect(suspended.due).toBe(card.due);
    expect(suspended.reps).toBe(card.reps);
    expect(suspended.interval).toBe(card.interval);
    expect(suspended.updatedAt).toBe(NOW);

    const resumed = resumeCard(suspended, NOW);
    expect(resumed.suspended).toBe(false);
    expect(resumed.reps).toBe(card.reps);
  });

  it("toggles in both directions", () => {
    expect(toggleSuspended(makeCard(), NOW).suspended).toBe(true);
    expect(toggleSuspended(makeCard({ suspended: true }), NOW).suspended).toBe(false);
  });

  it("keeps suspended cards out of the due count", () => {
    const card = makeCard({ reps: 2, due: DAY_START });
    expect(countDue([card], NOW, HOUR)).toBe(1);
    expect(countDue([suspendCard(card, NOW)], NOW, HOUR)).toBe(0);
  });

  it("does not change the original card", () => {
    const card = makeCard();
    suspendCard(card, NOW);
    expect(card.suspended).toBe(false);
  });
});

describe("resetCard", () => {
  it("turns a plant back into a seed", () => {
    const reset = resetCard(makeCard(), NOW);
    expect(reset.reps).toBe(0);
    expect(reset.lapses).toBe(0);
    expect(reset.interval).toBe(0);
    expect(reset.ease).toBe(INITIAL_EASE);
    expect(reset.due).toBe(NOW);
    expect(reset.lastReview).toBeNull();
    expect(reset.firstReview).toBeNull();
    expect(reset.updatedAt).toBe(NOW);
  });
});

describe("rescheduleCard", () => {
  it("moves the due date and leaves the rest alone", () => {
    const due = DAY_START + 10 * DAY_MS;
    const moved = rescheduleCard(makeCard(), due, NOW);
    expect(moved.due).toBe(due);
    expect(moved.reps).toBe(4);
    expect(moved.interval).toBe(21);
    expect(moved.updatedAt).toBe(NOW);
  });
});

describe("postponeCard", () => {
  it("pushes a plant to the start of tomorrow", () => {
    const postponed = postponeCard(makeCard(), NOW, HOUR);
    expect(postponed.due).toBe(DAY_START + DAY_MS);
    expect(postponed.reps).toBe(4);
    expect(postponed.interval).toBe(21);
  });

  it("takes the plant out of today's due count", () => {
    const card = makeCard({ reps: 2, due: DAY_START });
    const postponed = postponeCard(card, NOW, HOUR);
    expect(countDue([postponed], NOW, HOUR)).toBe(0);
    expect(countDue([postponed], NOW + DAY_MS, HOUR)).toBe(1);
  });
});
