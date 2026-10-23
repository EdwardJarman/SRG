import { App, Notice } from "obsidian";
import { postponeCard, rescheduleCard, resetCard, toggleSuspended } from "../core/cardActions";
import { logicalDayKey } from "../core/dates";
import { applyReview } from "../core/scheduler";
import { Card, Grade, GardenSettings } from "../core/types";
import { GardenStore } from "../store/cardStore";
import { ConfirmModal } from "../ui/confirmModal";
import { RescheduleModal } from "../ui/rescheduleModal";
import { openCardNote } from "../vault/opener";

function cardName(card: Card): string {
  return card.title || card.file;
}

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
      `Put "${cardName(latest)}" back to a seed? Its reviews and interval are cleared, the note is untouched.`,
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
      "Move plant to trash",
      `Move "${cardName(latest)}" to the trash? Its scheduling history is kept, and you can restore it from Manage plants. The note itself is left alone.`,
      "Move to trash",
      () => {
        this.store.trashCard(latest.id, Date.now());
        const notice = new Notice(`Moved "${cardName(latest)}" to the trash.`, 8000);
        const undo = notice.noticeEl.createEl("button", { cls: "srg-notice-undo", text: "Undo" });
        undo.addEventListener("click", () => {
          this.store.restoreCard(latest.id, Date.now());
          notice.hide();
        });
        if (onDone) onDone();
      },
    ).open();
  }

  restore(card: Card): void {
    this.store.restoreCard(card.id, Date.now());
    new Notice(`Restored "${cardName(card)}".`);
  }

  deleteForever(card: Card): void {
    const latest = this.latest(card);
    new ConfirmModal(
      this.app,
      "Delete plant forever",
      `Delete "${cardName(latest)}" and its scheduling history permanently? This cannot be undone. The note itself is left alone.`,
      "Delete forever",
      () => {
        this.store.deleteCard(latest.id);
      },
      { danger: true },
    ).open();
  }

  emptyTrash(): void {
    const trashed = this.store.getTrashedCards();
    if (trashed.length === 0) {
      new Notice("The trash is already empty.");
      return;
    }
    new ConfirmModal(
      this.app,
      "Empty the trash",
      `Delete ${trashed.length} ${trashed.length === 1 ? "plant" : "plants"} from the trash permanently? This cannot be undone. Notes are left alone.`,
      "Empty trash",
      () => {
        const removed = this.store.emptyTrash();
        new Notice(`Removed ${removed} ${removed === 1 ? "plant" : "plants"} from the trash.`);
      },
      { danger: true },
    ).open();
  }

  trashMissing(): void {
    const missing = this.store.getMissingCards();
    if (missing.length === 0) {
      new Notice("Every plant still has its note.");
      return;
    }
    new ConfirmModal(
      this.app,
      "Remove plants whose notes are gone",
      `Move ${missing.length} ${missing.length === 1 ? "plant" : "plants"} whose note is missing to the trash? You can restore them from the trash if the notes come back.`,
      "Move to trash",
      () => {
        const moved = this.store.trashCards(
          missing.map((card) => card.id),
          Date.now(),
        );
        new Notice(`Moved ${moved} ${moved === 1 ? "plant" : "plants"} to the trash.`);
      },
    ).open();
  }

  resetGarden(): void {
    if (this.store.isReadOnly()) {
      new Notice("This garden is read-only because its data file could not be saved safely.");
      return;
    }
    new ConfirmModal(
      this.app,
      "Reset the whole garden",
      "This removes every plant, including the trash, and all review history. Your notes are untouched. A backup of the current data file is written first. This cannot be undone from inside the plugin.",
      "Reset everything",
      () => {
        void this.store
          .resetGarden()
          .then((backupPath) => {
            new Notice(
              backupPath === null
                ? "The garden was already empty."
                : `Garden reset. The previous data was saved to ${backupPath}.`,
              10000,
            );
          })
          .catch((error) => {
            console.error("[Spaced Repetition Garden] Could not reset the garden:", error);
            new Notice("Could not reset the garden. See the developer console for details.");
          });
      },
      { requireText: "reset", danger: true },
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
    this.store.upsert({ ...card, updatedAt: Date.now() });
    this.store.undoReview(dayKey, wasAgain);
  }
}
