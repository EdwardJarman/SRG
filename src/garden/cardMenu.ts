import { Menu } from "obsidian";
import { Card } from "../core/types";
import type SpacedRepetitionGardenPlugin from "../main";

export function addCardActions(menu: Menu, plugin: SpacedRepetitionGardenPlugin, card: Card): void {
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
      .onClick(() => plugin.openCardNote(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle(card.suspended ? "Resume plant" : "Suspend plant")
      .setIcon(card.suspended ? "play-circle" : "pause")
      .onClick(() => plugin.toggleCardSuspended(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Reschedule...")
      .setIcon("calendar")
      .onClick(() => plugin.rescheduleCard(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Reset progress")
      .setIcon("rotate-ccw")
      .onClick(() => plugin.resetCardProgress(card)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Remove plant")
      .setIcon("trash")
      .onClick(() => plugin.removeCard(card)),
  );
}
