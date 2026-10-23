import { describe, expect, it } from "vitest";
import { deserializeGardenData, serializeGardenData } from "../src/core/persistence";
import { createCard } from "../src/core/scheduler";
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
    expect(adapter.list().files.some((path) => path.includes(".bak-"))).toBe(true);
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

describe("GardenStore trash", () => {
  it("hides trashed cards from active views and restores them", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "A.md", NOW));
    store.trashCard("a", NOW + 50);

    expect(store.getCards()).toHaveLength(0);
    expect(store.getTrashedCards().map((entry) => entry.id)).toEqual(["a"]);
    expect(store.getMissingCards()).toHaveLength(0);
    expect(store.findCard("A.md", { type: "note" })).toBeNull();
    expect(store.findCard("A.md", { type: "note" }, true)?.id).toBe("a");
    expect(store.getCard("a")?.trashedAt).toBe(NOW + 50);

    store.restoreCard("a", NOW + 100);
    expect(store.getCards()).toHaveLength(1);
    expect(store.getCard("a")?.trashedAt).toBeNull();
  });

  it("empties only the trash", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    store.upsert(card("a", "A.md", NOW));
    store.upsert(card("b", "B.md", NOW));
    store.upsert(card("c", "C.md", NOW));
    store.trashCards(["a", "b"], NOW + 50);

    expect(store.emptyTrash()).toBe(2);
    expect(store.getAllCards().map((entry) => entry.id)).toEqual(["c"]);
  });
});

describe("GardenStore multi-window writes", () => {
  it("keeps changes made in another window when writing", async () => {
    const adapter = new FakeAdapter();
    const first = new GardenStore(fakeApp(adapter), PATH);
    const second = new GardenStore(fakeApp(adapter), PATH);
    await first.load();
    await second.load();

    first.upsert(card("a", "A.md", 100));
    await first.flush();

    second.upsert(card("b", "B.md", 200));
    await second.flush();

    const saved = deserializeGardenData(adapter.files.get(PATH) ?? "");
    expect(Object.keys(saved?.cards ?? {}).sort()).toEqual(["a", "b"]);
  });

  it("syncs changes written by another window without saving", async () => {
    const adapter = new FakeAdapter();
    const first = new GardenStore(fakeApp(adapter), PATH);
    const second = new GardenStore(fakeApp(adapter), PATH);
    await first.load();
    await second.load();

    first.upsert(card("a", "A.md", 100));
    await first.flush();
    const writesBefore = adapter.writeCount;

    await second.syncFromDisk();

    expect(second.getCard("a")?.id).toBe("a");
    expect(adapter.writeCount).toBe(writesBefore);
  });

  it("merges conflicted copies and writes them into the main file", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();
    store.upsert(card("a", "A.md", 100));
    await store.flush();

    adapter.files.set(
      "Spaced Repetition Garden/cards (conflict 2026-01-10).json",
      serializeGardenData({ version: 2, cards: { b: card("b", "B.md", 200) }, daily: {} }),
    );

    await store.syncConflictCopies();
    expect(store.getCards().map((entry) => entry.id).sort()).toEqual(["a", "b"]);

    await store.flush();
    const saved = deserializeGardenData(adapter.files.get(PATH) ?? "");
    expect(Object.keys(saved?.cards ?? {}).sort()).toEqual(["a", "b"]);
  });
});

describe("GardenStore maintenance", () => {
  it("moves conflicted copies aside when resetting", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();
    store.upsert(card("a", "A.md", NOW));
    await store.flush();

    const conflictPath = "Spaced Repetition Garden/cards (conflict 2026-01-10).json";
    adapter.files.set(
      conflictPath,
      serializeGardenData({ version: 2, cards: { b: card("b", "B.md", NOW + 100) }, daily: {} }),
    );

    await store.resetGarden();

    expect(adapter.files.has(conflictPath)).toBe(false);
    const moved = Array.from(adapter.files.keys()).find((path) => path.startsWith(`${conflictPath}.bak-reset-`));
    expect(moved).toBeDefined();
    expect(deserializeGardenData(adapter.files.get(moved ?? "") ?? "")?.cards.b.id).toBe("b");

    const reloaded = new GardenStore(fakeApp(adapter), PATH);
    await reloaded.load();
    expect(reloaded.getAllCards()).toHaveLength(0);
  });

  it("prunes old daily history on load", async () => {
    const adapter = new FakeAdapter();
    adapter.files.set(
      PATH,
      serializeGardenData({
        version: 2,
        cards: {},
        daily: {
          "2020-01-01": { reviews: 3, again: 1 },
          "2026-01-10": { reviews: 2, again: 0 },
        },
      }),
    );

    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();

    expect(store.getData().daily["2020-01-01"]).toBeUndefined();
    expect(store.getData().daily["2026-01-10"]).toEqual({ reviews: 2, again: 0 });
  });

  it("backs up the garden before resetting it", async () => {
    const adapter = new FakeAdapter();
    const store = new GardenStore(fakeApp(adapter), PATH);
    await store.load();
    store.upsert(card("a", "A.md", NOW));
    store.recordReview("2026-01-10", true);
    await store.flush();

    const backupPath = await store.resetGarden();

    expect(backupPath).not.toBeNull();
    const backup = deserializeGardenData(adapter.files.get(backupPath ?? "") ?? "");
    expect(backup?.cards.a.id).toBe("a");
    expect(backup?.daily["2026-01-10"]).toEqual({ reviews: 1, again: 1 });
    expect(store.getAllCards()).toHaveLength(0);
    expect(store.getData().daily).toEqual({});
    const saved = deserializeGardenData(adapter.files.get(PATH) ?? "");
    expect(saved?.cards).toEqual({});
  });
});
