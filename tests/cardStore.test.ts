import { describe, expect, it } from "vitest";
import { createCard } from "../src/core/scheduler";
import { serializeGardenData } from "../src/core/persistence";
import { GardenStore } from "../src/store/cardStore";
import { FakeAdapter, fakeApp } from "./helpers/fakeVault";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();
const PATH = "Spaced Repetition Garden/cards.json";
const TMP = `${PATH}.tmp`;

function card(id: string, file: string, updatedAt: number) {
  return {
    ...createCard({ id, file, anchor: { type: "note" }, title: id, now: NOW - 1000 }),
    updatedAt,
  };
}

describe("GardenStore loading", () => {
  it("reads the saved garden and clears any stale temp file", async () => {
    const adapter = new FakeAdapter();
    adapter.files.set(PATH, serializeGardenData({ version: 1, cards: { a: card("a", "A.md", 1) }, daily: {} }));
    adapter.files.set(TMP, "not valid json");

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    expect(store.getCards()).toHaveLength(1);
    expect(adapter.files.has(TMP)).toBe(false);
    expect(store.loadProblem).toBeNull();
  });

  it("keeps cards from both files when a crash left a temp file behind", async () => {
    const adapter = new FakeAdapter();
    adapter.files.set(
      PATH,
      serializeGardenData({ version: 1, cards: { a: card("a", "A.md", 100) }, daily: {} }),
    );
    adapter.files.set(
      TMP,
      serializeGardenData({ version: 1, cards: { b: card("b", "B.md", 200) }, daily: {} }),
    );

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    const ids = store.getCards().map((entry) => entry.id).sort();
    expect(ids).toEqual(["a", "b"]);
    expect(adapter.files.has(TMP)).toBe(false);
  });

  it("takes the newer version of a card that exists in both files", async () => {
    const adapter = new FakeAdapter();
    const older = { ...card("a", "A.md", 100), title: "older" };
    const newer = { ...card("a", "A.md", 200), title: "newer" };
    adapter.files.set(PATH, serializeGardenData({ version: 1, cards: { a: older }, daily: {} }));
    adapter.files.set(TMP, serializeGardenData({ version: 1, cards: { a: newer }, daily: {} }));

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    expect(store.getCards()).toHaveLength(1);
    expect(store.getCard("a")?.title).toBe("newer");
  });

  it("recovers from a temp file when the main file is unreadable", async () => {
    const adapter = new FakeAdapter();
    adapter.files.set(PATH, "{ this is not json");
    adapter.files.set(
      TMP,
      serializeGardenData({ version: 1, cards: { a: card("a", "A.md", 1) }, daily: {} }),
    );

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    expect(store.getCards()).toHaveLength(1);
    expect(store.loadProblem).toBeNull();
  });

  it("backs up an unreadable garden and starts fresh", async () => {
    const adapter = new FakeAdapter();
    adapter.files.set(PATH, "{ not json");

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    expect(store.getCards()).toHaveLength(0);
    expect(store.loadProblem).toContain("backed up");
    expect(adapter.list().some((path) => path.includes(".bak-"))).toBe(true);
  });
});

describe("GardenStore writing", () => {
  it("writes through a temp file and leaves no temp file behind", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "A.md", NOW));
    await store.flush();

    expect(adapter.files.has(TMP)).toBe(false);
    expect(adapter.files.has(PATH)).toBe(true);
    expect(adapter.folders.has("Spaced Repetition Garden")).toBe(true);
    expect(store.getCards()).toHaveLength(1);
  });
});

describe("GardenStore missing notes", () => {
  it("marks every card of a note as missing and clears it again", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "Notes/x.md", NOW));
    store.upsert(card("b", "Notes/x.md", NOW));
    store.upsert(card("c", "Notes/y.md", NOW));

    store.setFileMissing("Notes/x.md", true);
    expect(store.getCard("a")?.missing).toBe(true);
    expect(store.getCard("b")?.missing).toBe(true);
    expect(store.getCard("c")?.missing).toBe(false);

    store.setFileMissing("Notes/x.md", false);
    expect(store.getCard("a")?.missing).toBe(false);
    expect(store.getCard("b")?.missing).toBe(false);
  });

  it("clears a single missing card", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "A.md", NOW));
    store.setFileMissing("A.md", true);
    expect(store.getCard("a")?.missing).toBe(true);

    store.clearMissing("a");
    expect(store.getCard("a")?.missing).toBe(false);
  });
});

describe("GardenStore review history", () => {
  it("records and undoes a review", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.recordReview("2026-01-10", false);
    store.recordReview("2026-01-10", true);
    expect(store.getData().daily["2026-01-10"]).toEqual({ reviews: 2, again: 1 });

    store.undoReview("2026-01-10", true);
    expect(store.getData().daily["2026-01-10"]).toEqual({ reviews: 1, again: 0 });

    store.undoReview("2026-01-10", false);
    expect(store.getData().daily["2026-01-10"]).toBeUndefined();
  });

  it("ignores an undo for a day that was never recorded", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.undoReview("2026-01-10", false);
    expect(store.getData().daily["2026-01-10"]).toBeUndefined();
  });
});

describe("GardenStore renames", () => {
  it("repoints cards at the new path", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "Folder/Note.md", NOW));
    store.repointFile("Folder/Note.md", "Moved/Note.md");

    expect(store.getCard("a")?.file).toBe("Moved/Note.md");
  });
});
