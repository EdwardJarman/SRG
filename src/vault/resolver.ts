import { App, TFile } from "obsidian";
import {
  findBlockByRef,
  findSection,
  parseText,
  pathsEqual,
  plainTextTitle,
  stripFrontmatter,
} from "../core/sections";
import { Card } from "../core/types";

export type ResolvedCard =
  | { status: "ok"; prompt: string; answer: string; relink: { anchor: Card["anchor"]; title: string } | null }
  | { status: "missing-file" }
  | { status: "orphaned" };

export async function resolveCard(app: App, card: Card): Promise<ResolvedCard> {
  const file = app.vault.getAbstractFileByPath(card.file);
  if (!(file instanceof TFile)) return { status: "missing-file" };

  let text: string;
  try {
    text = await app.vault.cachedRead(file);
  } catch (error) {
    console.error("[Spaced Repetition Garden] Failed to read", card.file, error);
    return { status: "missing-file" };
  }

  const parsed = parseText(text);

  if (card.anchor.type === "note") {
    const answer = stripFrontmatter(parsed).trim();
    const title = file.basename;
    return {
      status: "ok",
      prompt: title,
      answer: answer === "" ? "(This note has no content yet.)" : answer,
      relink: title === card.title ? null : { anchor: card.anchor, title },
    };
  }

  if (card.anchor.type === "heading") {
    const match = findSection(parsed, card.anchor);
    if (!match) return { status: "orphaned" };
    const content = match.content.trim();
    const changed =
      !pathsEqual(match.path, card.anchor.path) || match.hash !== card.anchor.hash || match.title !== card.title;
    return {
      status: "ok",
      prompt: match.title === "" ? "(untitled heading)" : match.title,
      answer: content === "" ? "(This heading has no content yet.)" : content,
      relink: changed ? { anchor: { type: "heading", path: match.path, hash: match.hash }, title: match.title } : null,
    };
  }

  const block = findBlockByRef(parsed, card.anchor.blockId);
  if (!block) return { status: "orphaned" };
  const content = block.text.trim();
  const prompt = plainTextTitle(content) || card.title || file.basename;
  return {
    status: "ok",
    prompt,
    answer: content === "" ? "(This block is empty.)" : content,
    relink: prompt === card.title ? null : { anchor: card.anchor, title: prompt },
  };
}
