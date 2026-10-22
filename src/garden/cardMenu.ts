import { Menu } from "obsidian";
import { Card } from "../core/types";
import type SpacedRepetitionGardenPlugin from "../main";

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
      .setTitle("Remove plant")
      .setIcon("trash")
      .onClick(() => service.remove(card)),
  );
}
