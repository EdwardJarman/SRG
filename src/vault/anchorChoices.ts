import { findBlockByRef, headingPaths, parseText, plainTextTitle, sectionHash } from "../core/sections";
import { Anchor } from "../core/types";

export interface AnchorChoice {
  label: string;
  anchor: Anchor;
  title: string;
}

const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9_-]+)\s*$/;

export function buildAnchorChoices(text: string, basename: string): AnchorChoice[] {
  const parsed = parseText(text);
  const choices: AnchorChoice[] = [
    { label: "Whole note", anchor: { type: "note" }, title: basename },
  ];

  const paths = headingPaths(parsed);
  for (let index = 0; index < parsed.headings.length; index++) {
    const heading = parsed.headings[index];
    const path = paths[index];
    const title = heading.text || basename;
    choices.push({
      label: `Heading: ${path.join(" \u203a ")}`,
      anchor: { type: "heading", path, hash: sectionHash(parsed, index) },
      title,
    });
  }

  const seen = new Set<string>();
  for (const line of parsed.lines) {
    const match = BLOCK_ID.exec(line);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    const block = findBlockByRef(parsed, match[1]);
    if (!block) continue;
    const title = plainTextTitle(block.text) || basename;
    choices.push({
      label: `Block ^${match[1]}${title === basename ? "" : `: ${title}`}`,
      anchor: { type: "block", blockId: match[1] },
      title,
    });
  }

  return choices;
}
