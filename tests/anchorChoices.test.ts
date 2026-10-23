import { describe, expect, it } from "vitest";
import { buildAnchorChoices } from "../src/vault/anchorChoices";

const TEXT = `# Plants

A fact about soil. ^soil123

## Roses

Roses need sun.

### Care

Water deeply.
`;

describe("anchor choices", () => {
  it("lists the whole note, headings and block markers", () => {
    const choices = buildAnchorChoices(TEXT, "Plants");
    expect(choices.map((choice) => choice.label)).toEqual([
      "Whole note",
      "Heading: Plants",
      "Heading: Plants \u203a Roses",
      "Heading: Plants \u203a Roses \u203a Care",
      "Block ^soil123: A fact about soil.",
    ]);
    expect(choices[1].title).toBe("Plants");
    expect(choices[3].anchor).toMatchObject({ type: "heading", path: ["Plants", "Roses", "Care"] });
  });

  it("does not list duplicate block ids", () => {
    const choices = buildAnchorChoices("One ^same\nTwo ^same\n", "Note");
    expect(choices.filter((choice) => choice.anchor.type === "block")).toHaveLength(1);
  });
});
