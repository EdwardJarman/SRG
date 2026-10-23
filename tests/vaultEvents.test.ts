import { describe, expect, it } from "vitest";
import { createCard } from "../src/core/scheduler";
import { handleVaultCreate, handleVaultDelete, handleVaultRename, VaultEventHost } from "../src/plugin/vaultEvents";
import { GardenStore } from "../src/store/cardStore";
import { FakeAdapter, fakeApp } from "./helpers/fakeVault";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();
const PATH = "Spaced Repetition Garden/cards.json";

function card(id: string, file: string) {
  return createCard({ id, file, anchor: { type: "note" }, title: id, now: NOW });
}

async function setup(cards = [card("a", "Notes/A.md"), card("b", "Notes/B.md")]) {
  const adapter = new FakeAdapter();
  const store = new GardenStore(fakeApp(adapter), PATH);
  await store.load();
  for (const entry of cards) store.upsert(entry);
  const notices: string[] = [];
  const host: VaultEventHost = {
    store,
    notify: (message) => notices.push(message),
  };
  return { store, host, notices };
}

describe("vault events", () => {
  it("holds back every plant in a note that was deleted", async () => {
    const { store, host, notices } = await setup();

    handleVaultDelete(host, "Notes/A.md");

    expect(store.getCard("a")?.missing).toBe(true);
    expect(store.getCard("b")?.missing).toBe(false);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("1 plant lost its note");
  });

  it("uses plural wording when several plants lose their note", async () => {
    const { store, host, notices } = await setup([
      card("a", "Notes/A.md"),
      card("b", "Notes/A.md"),
    ]);

    handleVaultDelete(host, "Notes/A.md");

    expect(store.getCard("a")?.missing).toBe(true);
    expect(store.getCard("b")?.missing).toBe(true);
    expect(notices[0]).toContain("2 plants lost their notes");
  });

  it("holds back every plant under a deleted folder", async () => {
    const { store, host, notices } = await setup([
      card("a", "Notes/Sub/A.md"),
      card("b", "Notes/Sub/B.md"),
      card("c", "Notes/Other.md"),
    ]);

    handleVaultDelete(host, "Notes/Sub");

    expect(store.getCard("a")?.missing).toBe(true);
    expect(store.getCard("b")?.missing).toBe(true);
    expect(store.getCard("c")?.missing).toBe(false);
    expect(notices[0]).toContain("2 plants lost their notes");
  });

  it("says nothing when a deleted note has no plants", async () => {
    const { host, notices } = await setup();

    handleVaultDelete(host, "Notes/Unknown.md");

    expect(notices).toHaveLength(0);
  });

  it("clears the missing flag when the note is created again", async () => {
    const { store, host } = await setup();
    store.setFileMissing("Notes/A.md", true);

    handleVaultCreate(host, "Notes/A.md");

    expect(store.getCard("a")?.missing).toBe(false);
  });

  it("repoints plants when their note is renamed", async () => {
    const { store, host } = await setup();

    handleVaultRename(host, "Notes/A.md", "Garden/A.md");

    expect(store.getCard("a")?.file).toBe("Garden/A.md");
    expect(store.getCard("b")?.file).toBe("Notes/B.md");
  });
});
