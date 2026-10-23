import { Anchor, Card } from "./types";

function headingText(path: string[]): string {
  if (path.length === 0) return "(untitled heading)";
  return path.join(" \u203a ");
}

export function anchorLabel(anchor: Anchor): string {
  if (anchor.type === "note") return "Whole note";
  if (anchor.type === "heading") return `Heading: ${headingText(anchor.path)}`;
  return `Block marker ^${anchor.blockId}`;
}

export function anchorShortLabel(anchor: Anchor): string {
  if (anchor.type === "note") return "note";
  if (anchor.type === "heading") return anchor.path[anchor.path.length - 1] ?? "(untitled heading)";
  return `^${anchor.blockId}`;
}

export function anchorReference(card: Card): string {
  if (card.anchor.type === "note") return `[[${card.file}]]`;
  if (card.anchor.type === "heading") {
    return `[[${card.file}#${card.anchor.path.join("#")}|${card.title || anchorShortLabel(card.anchor)}]]`;
  }
  return `[[${card.file}#^${card.anchor.blockId}|${card.title || card.anchor.blockId}]]`;
}

export function anchorProblemText(card: Card): string {
  if (card.anchor.type === "note") return `the note ${card.file}`;
  if (card.anchor.type === "heading") return `the heading "${headingText(card.anchor.path)}"`;
  return `the block marker ^${card.anchor.blockId}`;
}
