import { describe, expect, it } from "vitest";
import { ReviewSession, SessionHost } from "../src/core/reviewSession";
import { Card, DEFAULT_SETTINGS, Grade, GardenSettings } from "../src/core/types";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function makeCard(id: string, file: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    file,
    anchor: { type: "note" },
    title: id,
    created: NOW - 5_000,
    reps: 2,
    lapses: 0,
    interval: 6,
    ease: 2.5,
    due: NOW,
    lastReview: NOW - 1_000,
    firstReview: NOW - 5_000,
    suspended: false,
    missing: false,
    trashedAt: null,
    updatedAt: NOW - 1_000,
    ...overrides,
  };
}

class FakeHost implements SessionHost {
  cards: Card[] = [];
  settings: GardenSettings = { ...DEFAULT_SETTINGS };
  graded: Array<{ id: string; grade: Grade }> = [];
  ungraded: string[] = [];
  ungradedCards: Card[] = [];
  postponed: string[] = [];
  rescheduled: Array<{ id: string; due: number }> = [];

  getCards(): Card[] {
    return this.cards;
  }

  getSettings(): GardenSettings {
    return this.settings;
  }

  grade(card: Card, grade: Grade, now: number): { updated: Card; dayKey: string } {
    this.graded.push({ id: card.id, grade });
    const updated: Card = { ...card, reps: card.reps + 1, updatedAt: now };
    this.cards = this.cards.map((entry) => (entry.id === card.id ? updated : entry));
    return { updated, dayKey: "2026-01-10" };
  }

  ungrade(card: Card, _dayKey: string, _wasAgain: boolean): void {
    this.ungraded.push(card.id);
    this.ungradedCards.push(card);
  }

  postpone(card: Card): void {
    this.postponed.push(card.id);
  }

  rescheduleTo(card: Card, due: number): void {
    this.rescheduled.push({ id: card.id, due });
  }
}

describe("ReviewSession", () => {
  it("walks the queue and counts what was reviewed", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md"), makeCard("b", "B.md")]);

    expect(session.next()?.id).toBe("a");
    session.grade(4, NOW);
    expect(session.reviewed).toBe(1);
    expect(session.remaining).toBe(1);

    expect(session.next()?.id).toBe("b");
    session.grade(4, NOW);
    expect(session.reviewed).toBe(2);
    expect(session.next()).toBeNull();
  });

  it("puts a lapsed plant back in the queue", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md")]);

    session.next();
    session.grade(1, NOW);

    expect(session.again).toBe(1);
    expect(session.next()?.id).toBe("a");
  });

  it("buries the other plants from the same note when one lapses", () => {
    const host = new FakeHost();
    host.settings.burySiblings = true;
    const session = new ReviewSession(host, [
      makeCard("a", "Note.md"),
      makeCard("b", "Note.md"),
      makeCard("c", "Other.md"),
    ]);

    session.next();
    session.grade(1, NOW);

    expect(session.next()?.id).toBe("c");
  });

  it("keeps sibling plants in the queue when burying is off", () => {
    const host = new FakeHost();
    host.settings.burySiblings = false;
    const session = new ReviewSession(host, [
      makeCard("a", "Note.md"),
      makeCard("b", "Note.md"),
    ]);

    session.next();
    session.grade(1, NOW);

    expect(session.next()?.id).toBe("b");
  });

  it("undoes a grade and brings the plant back", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md"), makeCard("b", "B.md")]);

    session.next();
    session.grade(4, NOW);
    expect(session.reviewed).toBe(1);

    expect(session.undo()).toBe(true);
    expect(session.reviewed).toBe(0);
    expect(host.ungraded).toEqual(["a"]);
    expect(host.ungradedCards[0]?.reps).toBe(2);
    expect(session.next()?.id).toBe("a");
  });

  it("undoes the most recent grade first", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md"), makeCard("b", "B.md")]);

    session.next();
    session.grade(4, NOW);
    session.next();
    session.grade(4, NOW);
    expect(session.reviewed).toBe(2);

    session.undo();
    expect(session.reviewed).toBe(1);
    expect(session.next()?.id).toBe("b");

    session.undo();
    expect(session.reviewed).toBe(0);
    expect(session.next()?.id).toBe("a");
  });

  it("brings buried siblings back when the lapse is undone", () => {
    const host = new FakeHost();
    host.settings.burySiblings = true;
    const session = new ReviewSession(host, [
      makeCard("a", "Note.md"),
      makeCard("b", "Note.md"),
      makeCard("c", "Other.md"),
    ]);

    session.next();
    session.grade(1, NOW);
    session.undo();

    expect(session.next()?.id).toBe("a");
    expect(session.next()?.id).toBe("b");
  });

  it("has nothing to undo before the first grade", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md")]);

    expect(session.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
  });

  it("counts a postponed plant without counting it as a review", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md")]);

    session.next();
    session.postpone();

    expect(session.postponed).toBe(1);
    expect(session.reviewed).toBe(0);
    expect(host.postponed).toEqual(["a"]);
    expect(session.next()).toBeNull();
  });

  it("reschedules the plant on show", () => {
    const host = new FakeHost();
    const session = new ReviewSession(host, [makeCard("a", "A.md")]);

    session.next();
    session.reschedule(1234);

    expect(host.rescheduled).toEqual([{ id: "a", due: 1234 }]);
  });
});
