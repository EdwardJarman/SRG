import { App, MarkdownView, TFile } from "obsidian";
import { findBlockByRef, findSection, parseText } from "../core/sections";
import { Card } from "../core/types";

function targetLine(parsed: ReturnType<typeof parseText>, card: Card): number {
  if (card.anchor.type === "heading") {
    const match = findSection(parsed, card.anchor);
    if (match) {
      const heading = parsed.headings[match.index];
      if (heading) return heading.startLine;
    }
  }
  if (card.anchor.type === "block") {
    const block = findBlockByRef(parsed, card.anchor.blockId);
    if (block) return block.startLine;
  }
  return Math.max(0, parsed.frontmatterEndLine + 1);
}

export async function openCardNote(app: App, card: Card): Promise<void> {
  const file = app.vault.getAbstractFileByPath(card.file);
  if (!(file instanceof TFile)) {
    return;
  }

  let line = 0;
  try {
    line = targetLine(parseText(await app.vault.cachedRead(file)), card);
  } catch (error) {
    console.error("[Spaced Repetition Garden] Could not locate anchor in", card.file, error);
  }

  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active && active.file === file) {
    active.editor.setCursor({ line, ch: 0 });
    active.editor.focus();
    return;
  }

  try {
    // Reuse the note that is already open, otherwise open a new tab so views
    // like the garden are never replaced by the note.
    const leaf = active ? active.leaf : app.workspace.getLeaf("tab");
    await leaf.openFile(file, { eState: { line } });
  } catch (error) {
    console.error("[Spaced Repetition Garden] Could not open", card.file, error);
    return;
  }

  const opened = app.workspace.getActiveViewOfType(MarkdownView);
  if (opened && opened.file === file) {
    opened.editor.setCursor({ line, ch: 0 });
    opened.editor.focus();
  }
}
