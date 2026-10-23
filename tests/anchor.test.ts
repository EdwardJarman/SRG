import { describe, expect, it } from "vitest";
import {
  anchorLabel,
  anchorProblemText,
  anchorReference,
  anchorShortLabel,
} from "../src/core/anchor";
import { createCard } from "../src/core/scheduler";
import { Anchor } from "../src/core/types";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();

function card(anchor: Anchor, title: string, file = "Notes/Plants.md") {
  return createCard({ id: "srg-aaaaaaaa", file, anchor, title, now: NOW });
}

describe("anchor labels", () => {
  it("labels whole notes, headings and block markers", () => {
    expect(anchorLabel({ type: "note" })).toBe("Whole note");
    expect(anchorLabel({ type: "heading", path: ["Plants", "Roses"], hash: "" })).toBe(
      "Heading: Plants \u203a Roses",
    );
    expect(anchorLabel({ type: "block", blockId: "abc123" })).toBe("Block marker ^abc123");
  });

  it("shortens anchors for tight spaces", () => {
    expect(anchorShortLabel({ type: "note" })).toBe("note");
    expect(anchorShortLabel({ type: "heading", path: ["Plants", "Roses"], hash: "" })).toBe("Roses");
    expect(anchorShortLabel({ type: "block", blockId: "abc123" })).toBe("^abc123");
  });
});

describe("anchor references", () => {
  it("builds a wikilink for each anchor type", () => {
    expect(anchorReference(card({ type: "note" }, "Plants"))).toBe("[[Notes/Plants.md]]");
    expect(
      anchorReference(card({ type: "heading", path: ["Plants", "Roses"], hash: "" }, "Roses")),
    ).toBe("[[Notes/Plants.md#Plants#Roses|Roses]]");
    expect(anchorReference(card({ type: "block", blockId: "abc123" }, "A fact"))).toBe(
      "[[Notes/Plants.md#^abc123|A fact]]",
    );
  });

  it("describes what is broken when a note or anchor is missing", () => {
    expect(anchorProblemText(card({ type: "note" }, "Plants"))).toBe("the note Notes/Plants.md");
    expect(
      anchorProblemText(card({ type: "heading", path: ["Plants", "Roses"], hash: "" }, "Roses")),
    ).toBe('the heading "Plants \u203a Roses"');
    expect(anchorProblemText(card({ type: "block", blockId: "abc123" }, "A fact"))).toBe(
      "the block marker ^abc123",
    );
  });
});
