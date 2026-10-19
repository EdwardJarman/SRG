import { Editor, TFile } from "obsidian";
import { createCard } from "../core/scheduler";
import { escapeRegExp, headingTargetAtLine, parseText, plainTextTitle } from "../core/sections";
import { Anchor } from "../core/types";
import { GardenStore } from "../store/cardStore";
import { randomId } from "../utils/random";

export type PlantOutcome =
  | { status: "planted"; description: string }
  | { status: "already"; description: string }
  | { status: "error"; description: string };

export function plantFlashcard(store: GardenStore, editor: Editor, file: TFile): PlantOutcome {
  const now = Date.now();

  if (editor.getSelection().trim().length > 0) {
    const to = editor.getCursor("to");
    const line = editor.getLine(to.line);
    const existing = /(?:^|\s)\^([A-Za-z0-9_-]+)\s*$/.exec(line);

    let blockId: string;
    if (existing) {
      blockId = existing[1];
    } else {
      blockId = randomId();
      const trimmedLine = line.trimEnd();
      editor.setLine(to.line, trimmedLine === "" ? `^${blockId}` : `${trimmedLine} ^${blockId}`);
    }

    const withoutRef = line.replace(new RegExp(`[ \\t]*\\^${escapeRegExp(blockId)}[ \\t]*$`, "m"), "");
    const title = plainTextTitle(withoutRef) || file.basename;
    return finalize(store, file, { type: "block", blockId }, title, "block", now);
  }

  const parsed = parseText(editor.getValue());
  const target = headingTargetAtLine(parsed, editor.getCursor().line);
  if (target) {
    return finalize(
      store,
      file,
      { type: "heading", path: target.path, hash: target.hash },
      target.title || file.basename,
      "heading",
      now,
    );
  }

  return finalize(store, file, { type: "note" }, file.basename, "note", now);
}

function finalize(
  store: GardenStore,
  file: TFile,
  anchor: Anchor,
  title: string,
  kind: string,
  now: number,
): PlantOutcome {
  const description = `${kind} "${title}"`;
  if (store.findCard(file.path, anchor)) {
    return { status: "already", description };
  }
  let id = randomId();
  for (let guard = 0; guard < 5 && store.getCard(id) !== null; guard++) {
    id = randomId();
  }
  store.upsert(createCard({ id, file: file.path, anchor, title, now }));
  return { status: "planted", description };
}
