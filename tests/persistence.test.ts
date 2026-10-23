import { describe, expect, it } from "vitest";
import {
  DAILY_HISTORY_DAYS,
  DATA_VERSION,
  deserializeGardenData,
  emptyGardenData,
  mergeGardenData,
  pruneDaily,
  sanitizeGardenData,
  serializeGardenData,
} from "../src/core/persistence";
import { shiftDayKey } from "../src/core/dates";
import { createCard } from "../src/core/scheduler";
import { GardenData } from "../src/core/types";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function sampleData(): GardenData {
  const card = createCard({
    id: "srg-aaaa1111",
    file: "Notes/Biology.md",
    anchor: { type: "heading", path: ["Biology", "Cells"], hash: "abcd1234" },
    title: "Cells",
    now: NOW,
  });
  return {
    version: DATA_VERSION,
    cards: { [card.id]: card },
    daily: { "2026-01-10": { reviews: 3, again: 1 } },
    writers: { legacy: { "2026-01-10": { reviews: 3, again: 1 } } },
    deleted: {},
    resetAt: 0,
  };
}

describe("garden data persistence", () => {
  it("round-trips through serialize and deserialize", () => {
    const original = sampleData();
    const restored = deserializeGardenData(serializeGardenData(original));
    expect(restored).toEqual(original);
  });

  it("rejects garbage", () => {
    expect(deserializeGardenData("not json")).toBeNull();
    expect(deserializeGardenData("[1,2,3]")).toBeNull();
    expect(sanitizeGardenData({ version: DATA_VERSION, cards: [] })).toBeNull();
  });

  it("rejects files from a future plugin version", () => {
    expect(sanitizeGardenData({ version: DATA_VERSION + 1, cards: {} })).toBeNull();
  });

  it("accepts a file with a missing version and defaults to the current schema", () => {
    expect(sanitizeGardenData({ cards: {} })).toEqual(emptyGardenData());
  });

  it("drops malformed cards and repairs bad values", () => {
    const restored = sanitizeGardenData({
      version: DATA_VERSION,
      cards: {
        good: createCard({ id: "good", file: "a.md", anchor: { type: "note" }, title: "A", now: NOW }),
        broken: { nope: true },
        nofile: {
          ...createCard({ id: "nofile", file: "", anchor: { type: "note" }, title: "", now: NOW }),
          file: "",
        },
        weird: { file: "x.md", anchor: { type: "note" }, ease: 99, reps: -5, interval: -1 },
      },
      daily: { "2026-01-10": { reviews: 2, again: 9 } },
    });

    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(Object.keys(restored.cards).sort()).toEqual(["good", "weird"]);
    expect(restored.cards.good.ease).toBe(2.5);
    expect(restored.cards.weird.ease).toBe(2.8);
    expect(restored.cards.weird.reps).toBe(0);
    expect(restored.cards.weird.interval).toBe(0);
    expect(restored.daily["2026-01-10"]).toEqual({ reviews: 2, again: 2 });
  });

  it("merges by keeping the newest copy of each card", () => {
    const older = createCard({ id: "x", file: "a.md", anchor: { type: "note" }, title: "A", now: NOW });
    const newer = { ...older, title: "Renamed", updatedAt: NOW + 1000 };
    const other = createCard({ id: "y", file: "b.md", anchor: { type: "note" }, title: "B", now: NOW });

    const a: GardenData = {
      version: DATA_VERSION,
      cards: { x: older },
      daily: { "2026-01-10": { reviews: 2, again: 0 } },
      writers: {},
      deleted: {},
      resetAt: 0,
    };
    const b: GardenData = {
      version: DATA_VERSION,
      cards: { x: newer, y: other },
      daily: { "2026-01-10": { reviews: 5, again: 1 } },
      writers: {},
      deleted: {},
      resetAt: 0,
    };

    const merged = mergeGardenData(a, b);
    expect(merged.cards.x.title).toBe("Renamed");
    expect(Object.keys(merged.cards).sort()).toEqual(["x", "y"]);
    expect(merged.daily["2026-01-10"]).toEqual({ reviews: 5, again: 1 });
  });

  it("resolves equal timestamps deterministically", () => {
    const base = createCard({ id: "x", file: "a.md", anchor: { type: "note" }, title: "A", now: NOW });
    const a: GardenData = { ...emptyGardenData(), cards: { x: { ...base, title: "A" } } };
    const b: GardenData = { ...emptyGardenData(), cards: { x: { ...base, title: "B" } } };

    expect(mergeGardenData(a, b).cards.x).toEqual(mergeGardenData(b, a).cards.x);
  });

  it("migrates legacy daily totals into a writer bucket", () => {
    const data = sanitizeGardenData({
      version: 2,
      cards: {},
      daily: { "2026-01-10": { reviews: 3, again: 1 } },
    });
    expect(data?.writers).toEqual({ legacy: { "2026-01-10": { reviews: 3, again: 1 } } });
    expect(data?.daily).toEqual({ "2026-01-10": { reviews: 3, again: 1 } });
  });

  it("sums separate writers and keeps the highest value from the same writer", () => {
    const a: GardenData = {
      ...sampleData(),
      cards: {},
      writers: { alice: { "2026-01-10": { reviews: 2, again: 0 } } },
      daily: { "2026-01-10": { reviews: 2, again: 0 } },
    };
    const b: GardenData = {
      ...sampleData(),
      cards: {},
      writers: {
        alice: { "2026-01-10": { reviews: 3, again: 1 } },
        bob: { "2026-01-10": { reviews: 1, again: 1 } },
      },
      daily: { "2026-01-10": { reviews: 4, again: 2 } },
    };

    expect(mergeGardenData(a, b).daily["2026-01-10"]).toEqual({ reviews: 4, again: 2 });
  });

  it("lets tombstones beat cards and drops cards older than a reset", () => {
    const before = createCard({ id: "old", file: "old.md", anchor: { type: "note" }, title: "Old", now: NOW });
    const after = createCard({ id: "new", file: "new.md", anchor: { type: "note" }, title: "New", now: NOW + 500 });
    const resetAt = NOW + 100;
    const a: GardenData = {
      ...emptyGardenData(),
      cards: { old: before, new: after, gone: { ...before, id: "gone" } },
      deleted: { gone: NOW + 200 },
      resetAt,
    };
    const b: GardenData = {
      ...emptyGardenData(),
      cards: { old: before, gone: { ...before, id: "gone", updatedAt: NOW + 900 } },
    };

    const merged = mergeGardenData(a, b);
    expect(Object.keys(merged.cards)).toEqual(["new"]);
    expect(merged.deleted.gone).toBe(NOW + 200);
    expect(merged.resetAt).toBe(resetAt);
  });

  it("writes the same bytes regardless of insertion order", () => {
    const first = sampleData();
    const second = sampleData();
    second.daily = {};
    second.writers = { b: { "2026-01-10": { reviews: 1, again: 0 } }, a: { "2026-01-10": { reviews: 2, again: 0 } }, ...second.writers };
    second.daily = { "2026-01-10": { reviews: 3, again: 1 } };
    expect(serializeGardenData(sampleData())).toBe(serializeGardenData({ ...sampleData() }));
    expect(Object.keys(JSON.parse(serializeGardenData(second)).writers)).toEqual(["a", "b", "legacy"]);
    expect(first.resetAt).toBe(0);
  });

  it("serializes compact data without changing what is stored", () => {
    const original = sampleData();
    const pretty = serializeGardenData(original);
    const compact = serializeGardenData(original, true);

    expect(compact.length).toBeLessThan(pretty.length);
    expect(deserializeGardenData(compact)).toEqual(original);
  });

  it("keeps trashedAt and drops invalid daily keys", () => {
    const card = createCard({
      id: "a",
      file: "a.md",
      anchor: { type: "note" },
      title: "A",
      now: NOW,
    });
    const restored = sanitizeGardenData({
      version: DATA_VERSION,
      cards: { a: { ...card, trashedAt: NOW + 100 } },
      daily: {
        "2026-01-10": { reviews: 2, again: 1 },
        "2026-99-99": { reviews: 4, again: 0 },
        garbage: { reviews: 99, again: 0 },
      },
    });

    expect(restored?.cards.a.trashedAt).toBe(NOW + 100);
    expect(restored?.daily).toEqual({ "2026-01-10": { reviews: 2, again: 1 } });
  });

  it("prunes daily history before the cutoff without touching recent days", () => {
    const today = "2026-01-10";
    const cutoff = shiftDayKey(today, -DAILY_HISTORY_DAYS);
    const tooOld = shiftDayKey(cutoff, -1);
    const daily = {
      [tooOld]: { reviews: 1, again: 0 },
      [cutoff]: { reviews: 2, again: 0 },
      [today]: { reviews: 3, again: 0 },
    };

    expect(pruneDaily(daily, today)).toBe(1);
    expect(daily[tooOld]).toBeUndefined();
    expect(daily[cutoff]).toEqual({ reviews: 2, again: 0 });
    expect(daily[today]).toEqual({ reviews: 3, again: 0 });
  });
});
