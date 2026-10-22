import { App } from "obsidian";
import { postponeCard, rescheduleCard, resetCard, toggleSuspended } from "../core/cardActions";
import { logicalDayKey } from "../core/dates";
import { applyReview } from "../core/scheduler";
import { Card, Grade, GardenSettings } from "../core/types";
import { GardenStore } from "../store/cardStore";
import { ConfirmModal } from "../ui/confirmModal";
import { RescheduleModal } from "../ui/rescheduleModal";
import { openCardNote } from "../vault/opener";

export class CardService {
  constructor(
    private readonly app: App,
    private readonly store: GardenStore,
    private readonly readSettings: () => GardenSettings,
  ) {}

  getCards(): Card[] {
    return this.store.getCards();
  }

  getSettings(): GardenSettings {
    return this.readSettings();
  }

  latest(card: Card): Card {
    return this.store.getCard(card.id) ?? card;
  }

  toggleSuspended(card: Card): void {
    this.store.upsert(toggleSuspended(this.latest(card), Date.now()));
  }

  postpone(card: Card): void {
    const settings = this.readSettings();
    this.store.upsert(postponeCard(this.latest(card), Date.now(), settings.dayStartHour));
  }

  reschedule(card: Card): void {
    this.rescheduleWith(card, (due) => this.rescheduleTo(card, due));
  }

  rescheduleWith(card: Card, onDone: (due: number) => void): void {
    const settings = this.readSettings();
    const latest = this.latest(card);
    new RescheduleModal(this.app, latest, settings.dayStartHour, (due) => {
      onDone(due);
    }).open();
  }

  rescheduleTo(card: Card, due: number): void {
    this.store.upsert(rescheduleCard(this.latest(card), due, Date.now()));
  }

  resetProgress(card: Card): void {
    const latest = this.latest(card);
    new ConfirmModal(
      this.app,
      "Reset progress",
      `Put "${latest.title || latest.file}" back to a seed? Its reviews and interval are cleared, the note is untouched.`,
      "Reset",
      () => {
        this.store.upsert(resetCard(this.latest(latest), Date.now()));
      },
    ).open();
  }

  remove(card: Card, onDone?: () => void): void {
    const latest = this.latest(card);
    new ConfirmModal(
      this.app,
      "Remove plant",
      `Remove "${latest.title || latest.file}" and its scheduling history? The note itself is left alone.`,
      "Remove",
      () => {
        this.store.deleteCard(card.id);
        if (onDone) onDone();
      },
    ).open();
  }

  relink(card: Card, anchor: Card["anchor"], title: string): void {
    this.store.upsert({ ...this.latest(card), anchor, title, updatedAt: Date.now() });
  }

  clearMissing(card: Card): void {
    this.store.clearMissing(card.id);
  }

  flush(): void {
    void this.store.flush();
  }

  openNote(card: Card): void {
    void openCardNote(this.app, this.latest(card));
  }

  grade(card: Card, grade: Grade, now: number): { updated: Card; dayKey: string } {
    const settings = this.readSettings();
    const base = this.latest(card);
    const updated = applyReview(base, grade, { now, dayStartHour: settings.dayStartHour });
    const dayKey = logicalDayKey(now, settings.dayStartHour);
    this.store.upsert(updated);
    this.store.recordReview(dayKey, grade === 1);
    return { updated, dayKey };
  }

  ungrade(card: Card, dayKey: string, wasAgain: boolean): void {
    this.store.upsert(this.latest(card));
    this.store.undoReview(dayKey, wasAgain);
  }
}
