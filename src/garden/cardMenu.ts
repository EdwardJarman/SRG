import { Menu, Notice } from "obsidian";
import { anchorLabel, anchorReference } from "../core/anchor";
import { Card } from "../core/types";
import type SpacedRepetitionGardenPlugin from "../main";

async function copyAnchor(card: Card): Promise<void> {
  const reference = anchorReference(card);
  try {
    await navigator.clipboard.writeText(reference);
    new Notice(`Copied ${anchorLabel(card.anchor)}.`);
  } catch (error) {
    console.error("[Spaced Repetition Garden] Could not copy the anchor:", error);
    new Notice(reference, 12000);
  }
}

export function addCardActions(menu: Menu, plugin: SpacedRepetitionGardenPlugin, card: Card): void {
  const service = plugin.cards;
  menu.addItem((item) =>
    item
      .setTitle("Review now")
      .setIcon("play")
      .onClick(() => plugin.openCardReview(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Open note")
      .setIcon("file-text")
      .onClick(() => service.openNote(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Copy anchor")
      .setIcon("copy")
      .onClick(() => void copyAnchor(card)),
  );
  if (card.missing) {
    menu.addItem((item) =>
      item
        .setTitle("Mark note as present")
        .setIcon("check")
        .onClick(() => service.clearMissing(card)),
    );
  }
  menu.addItem((item) =>
    item
      .setTitle(card.suspended ? "Resume plant" : "Suspend plant")
      .setIcon(card.suspended ? "play-circle" : "pause")
      .onClick(() => service.toggleSuspended(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Reschedule...")
      .setIcon("calendar")
      .onClick(() => service.reschedule(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Reset progress")
      .setIcon("rotate-ccw")
      .onClick(() => service.resetProgress(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Move to trash")
      .setIcon("trash")
      .onClick(() => service.remove(card)),
  );
}
