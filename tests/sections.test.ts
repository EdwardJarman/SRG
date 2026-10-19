import { describe, expect, it } from "vitest";
import {
  findBlockByRef,
  findSection,
  headingPaths,
  headingTargetAtLine,
  parseText,
  sectionContent,
  sectionHash,
  stripFrontmatter,
} from "../src/core/sections";

const MD = [
  "---",
  "tags: [biology]",
  "---",
  "# Biology",
  "",
  "Intro text.",
  "",
  "## Photosynthesis",
  "",
  "Plants convert light.",
  "",
  "```",
  "# not a heading",
  "```",
  "",
  "### Details",
  "",
  "Chlorophyll.",
  "",
  "## Respiration",
  "",
  "Cells burn sugar.",
].join("\n");

describe("parseText", () => {
  const parsed = parseText(MD);

  it("finds frontmatter and ATX headings but ignores fenced code", () => {
    expect(parsed.frontmatterEndLine).toBe(2);
    expect(parsed.headings.map((heading) => heading.text)).toEqual([
      "Biology",
      "Photosynthesis",
      "Details",
      "Respiration",
    ]);
    expect(parsed.headings.map((heading) => heading.level)).toEqual([1, 2, 3, 2]);
    expect(parsed.headings[1].startLine).toBe(7);
  });

  it("builds heading paths by level", () => {
    expect(headingPaths(parsed)).toEqual([
      ["Biology"],
      ["Biology", "Photosynthesis"],
      ["Biology", "Photosynthesis", "Details"],
      ["Biology", "Respiration"],
    ]);
  });

  it("takes a section down to the next heading of equal or higher level", () => {
    const content = sectionContent(parsed, 1);
    expect(content).toContain("Plants convert light.");
    expect(content).toContain("# not a heading");
    expect(content).toContain("### Details");
    expect(content).toContain("Chlorophyll.");
    expect(content).not.toContain("Cells burn sugar.");
  });

  it("hashes sections consistently and differently", () => {
    expect(sectionHash(parsed, 1)).toBe(sectionHash(parseText(MD), 1));
    expect(sectionHash(parsed, 1)).not.toBe(sectionHash(parsed, 3));
  });

  it("strips frontmatter from the body", () => {
    const body = stripFrontmatter(parsed);
    expect(body.startsWith("# Biology")).toBe(true);
    expect(body).not.toContain("tags:");
  });
});

describe("headingTargetAtLine", () => {
  const parsed = parseText(MD);

  it("finds the heading a cursor line falls under", () => {
    expect(headingTargetAtLine(parsed, 5)?.path).toEqual(["Biology"]);
    expect(headingTargetAtLine(parsed, 9)?.path).toEqual(["Biology", "Photosynthesis"]);
    expect(headingTargetAtLine(parsed, 17)?.path).toEqual(["Biology", "Photosynthesis", "Details"]);
    expect(headingTargetAtLine(parsed, 0)).toBeNull();
  });
});

describe("findSection", () => {
  it("matches by path and prefers the hash when sibling headings repeat", () => {
    const text = ["# Biology", "## Notes", "alpha", "", "## Notes", "beta"].join("\n");
    const parsed = parseText(text);
    const betaHash = sectionHash(parsed, 2);

    const match = findSection(parsed, { path: ["Biology", "Notes"], hash: betaHash });
    expect(match).not.toBeNull();
    expect(match?.index).toBe(2);
    expect(match?.content).toContain("beta");
  });

  it("falls back to the content hash when the heading was renamed", () => {
    const original = parseText(["# Biology", "## Respiration", "Cells burn sugar."].join("\n"));
    const originalHash = sectionHash(original, 1);
    const renamed = parseText(["# Biology", "## Cellular Respiration", "Cells burn sugar."].join("\n"));

    const match = findSection(renamed, { path: ["Biology", "Respiration"], hash: originalHash });
    expect(match).not.toBeNull();
    expect(match?.title).toBe("Cellular Respiration");
    expect(match?.path).toEqual(["Biology", "Cellular Respiration"]);
  });

  it("returns null when neither path nor hash matches", () => {
    const parsed = parseText(MD);
    expect(findSection(parsed, { path: ["Biology", "Missing"], hash: "00000000" })).toBeNull();
  });
});

describe("findBlockByRef", () => {
  it("finds the paragraph around a block id and strips the reference", () => {
    const text = ["Intro para.", "", "First line of block", "second line of block ^srg-ab12cd34", "", "After."].join(
      "\n",
    );
    const parsed = parseText(text);
    const block = findBlockByRef(parsed, "srg-ab12cd34");
    expect(block).not.toBeNull();
    expect(block?.startLine).toBe(2);
    expect(block?.endLine).toBe(3);
    expect(block?.text).toBe("First line of block\nsecond line of block");
  });

  it("returns null when the id is gone", () => {
    expect(findBlockByRef(parseText(MD), "srg-missing01")).toBeNull();
  });
});

describe("setext headings", () => {
  it("supports underline-style headings", () => {
    const text = ["Title", "=====", "", "body", "", "Sub", "---", "", "after"].join("\n");
    const parsed = parseText(text);

    expect(parsed.headings.map((heading) => heading.text)).toEqual(["Title", "Sub"]);
    expect(parsed.headings[0].level).toBe(1);
    expect(parsed.headings[1].level).toBe(2);
    expect(sectionContent(parsed, 0)).toContain("body");
    expect(sectionContent(parsed, 0)).toContain("after"); // h1 section includes its h2 subsection
    expect(sectionContent(parsed, 1)).toContain("after");
  });
});
