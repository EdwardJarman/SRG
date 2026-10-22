import { describe, expect, it } from "vitest";
import { Editor, TFile } from "obsidian";
import { findBlockAtLine, parseText } from "../src/core/sections";
import { plantFlashcard } from "../src/vault/cardCreator";
import { GardenStore } from "../src/store/cardStore";
import { FakeAdapter, fakeApp } from "./helpers/fakeVault";

class FakeEditor {
  private text: string;

  constructor(
    text: string,
    private readonly fromLine: number,
    private readonly toLine: number,
  ) {
    this.text = text;
  }

  getValue(): string {
    return this.text;
  }

  getSelection(): string {
    return "selected words";
  }

  getCursor(which: "from" | "to" | "head" = "head"): { line: number; ch: number } {
    const line = which === "to" ? this.toLine : which === "from" ? this.fromLine : this.fromLine;
    return { line, ch: 0 };
  }

  getLine(line: number): string {
    return this.text.split("\n")[line] ?? "";
  }

  setLine(line: number, value: string): void {
    const lines = this.text.split("\n");
    lines[line] = value;
    this.text = lines.join("\n");
  }
}

function editor(text: string, fromLine: number, toLine: number): Editor {
  return new FakeEditor(text, fromLine, toLine) as unknown as Editor;
}

function file(): TFile {
  return { path: "Notes/Test.md", basename: "Test" } as unknown as TFile;
}

async function store(): Promise<GardenStore> {
  const instance = new GardenStore(fakeApp(new FakeAdapter()), "Spaced Repetition Garden/cards.json");
  await instance.load();
  return instance;
}

describe("findBlockAtLine", () => {
  it("finds the paragraph a line belongs to", () => {
    const parsed = parseText("First line\nsecond line\n\nAnother paragraph\n");
    const block = findBlockAtLine(parsed, 1);
    expect(block?.startLine).toBe(0);
    expect(block?.endLine).toBe(1);
    expect(block?.text).toBe("First line\nsecond line");
  });

  it("returns nothing for a heading line", () => {
    const parsed = parseText("# Heading\n\nText\n");
    expect(findBlockAtLine(parsed, 0)).toBeNull();
  });

  it("returns nothing for a line outside the note", () => {
    const parsed = parseText("Text\n");
    expect(findBlockAtLine(parsed, 9)).toBeNull();
  });
});

describe("plantFlashcard with a selection", () => {
  it("plants a block card for a selection inside one paragraph", async () => {
    const instance = await store();
    const text = "One paragraph\n\nSecond paragraph\n";
    const outcome = plantFlashcard(instance, editor(text, 0, 0), file());

    expect(outcome.status).toBe("planted");
    const card = instance.getCards()[0];
    expect(card.anchor.type).toBe("block");
  });

  it("plants the section when the selection runs over several paragraphs", async () => {
    const instance = await store();
    const text = "# Watering\n\nFirst paragraph\n\nSecond paragraph\n";
    const outcome = plantFlashcard(instance, editor(text, 2, 4), file());

    expect(outcome.status).toBe("planted");
    const card = instance.getCards()[0];
    expect(card.anchor.type).toBe("heading");
    if (card.anchor.type === "heading") {
      expect(card.anchor.path).toEqual(["Watering"]);
    }
  });

  it("plants the whole note when the selection has no section above it", async () => {
    const instance = await store();
    const text = "First paragraph\n\nSecond paragraph\n";
    const outcome = plantFlashcard(instance, editor(text, 0, 2), file());

    expect(outcome.status).toBe("planted");
    expect(instance.getCards()[0].anchor.type).toBe("note");
  });

  it("adds a block marker to the note so the card survives edits", async () => {
    const instance = await store();
    const text = "One paragraph\n";
    const fake = new FakeEditor(text, 0, 0);
    plantFlashcard(instance, fake as unknown as Editor, file());

    expect(fake.getLine(0)).toMatch(/\^srg-[a-z0-9]{8}$/);
  });
});
