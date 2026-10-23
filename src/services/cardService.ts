import { App, Notice, TFile } from "obsidian";
import { postponeCard, rescheduleCard, resetCard, toggleSuspended } from "../core/cardActions";
import { logicalDayKey } from "../core/dates";
import { applyReview } from "../core/scheduler";
import { Card, Grade, GardenSettings } from "../core/types";
import { GardenStore } from "../store/cardStore";
import { AnchorRepairModal } from "../ui/anchorRepairModal";
import { ConfirmModal } from "../ui/confirmModal";
import { RescheduleModal } from "../ui/rescheduleModal";
import { openCardNote } from "../vault/opener";
import { resolveCard } from "../vault/resolver";

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

  private ensureWritable(): boolean {
    if (!this.store.isReadOnly()) return true;
    new Notice(this.store.getReadOnlyReason() ?? "This garden is read-only.");
    return false;
  }

  toggleSuspended(card: Card): void {
    if (!this.ensureWritable()) return;
    this.store.upsert(toggleSuspended(this.latest(card), Date.now()));
  }

  postpone(card: Card): void {
    if (!this.ensureWritable()) return;
    const settings = this.readSettings();
    this.store.upsert(postponeCard(this.latest(card), Date.now(), settings.dayStartHour));
  }

  reschedule(card: Card): void {
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
    this.store.upsert(rescheduleCard(this.latest(card), due, Date.now()));
  }

  resetProgress(card: Card): void {
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
    this.store.restoreCard(card.id, Date.now());
    new Notice(`Restored "${cardName(card)}".`);
  }

  deleteForever(card: Card): void {
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
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
    if (!this.ensureWritable()) return;
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
                ? "Garden reset."
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
    if (!this.ensureWritable()) return;
    this.store.upsert({ ...this.latest(card), anchor, title, orphaned: false, updatedAt: Date.now() });
  }

  repairAnchor(card: Card, onDone?: () => void): void {
    if (!this.ensureWritable()) return;
    const latest = this.latest(card);
    new AnchorRepairModal(this.app, latest, (choice) => {
      this.relink(latest, choice.anchor, choice.title);
      new Notice(`Repaired the anchor for "${cardName(latest)}".`);
      if (onDone) onDone();
    }).open();
  }

  async reconcileFileAnchors(filePath: string): Promise<void> {
    if (this.store.isReadOnly()) return;
    const cards = this.store.getAllCards().filter((card) => card.file === filePath && !card.missing);
    if (cards.length === 0) return;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    for (const card of cards) {
      if (this.store.getCard(card.id) === null) continue;
      const resolved = await resolveCard(this.app, card);
      if (resolved.status === "missing-file") continue;
      if (resolved.status === "orphaned") {
        this.store.setOrphaned(card.id, true);
        continue;
      }
      this.store.setOrphaned(card.id, false);
      if (resolved.relink) {
        const latest = this.latest(card);
        this.store.upsert({
          ...latest,
          anchor: resolved.relink.anchor,
          title: resolved.relink.title,
          orphaned: false,
          updatedAt: Date.now(),
        });
      }
    }
  }

  clearOrphaned(card: Card): void {
    this.store.setOrphaned(card.id, false);
  }

  markOrphaned(card: Card, orphaned: boolean): void {
    this.store.setOrphaned(card.id, orphaned);
  }

  clearMissing(card: Card): void {
    this.store.clearMissing(card.id);
  }

  markMissing(card: Card, missing: boolean): void {
    this.store.setFileMissing(card.file, missing);
  }

  flush(): void {
    void this.store.flush();
  }

  openNote(card: Card): void {
    void openCardNote(this.app, this.latest(card));
  }

  grade(card: Card, grade: Grade, now: number): { updated: Card; dayKey: string } {
    if (!this.ensureWritable()) {
      return { updated: card, dayKey: logicalDayKey(now, this.readSettings().dayStartHour) };
    }
    const settings = this.readSettings();
    const base = this.latest(card);
    const updated = applyReview(base, grade, { now, dayStartHour: settings.dayStartHour });
    const dayKey = logicalDayKey(now, settings.dayStartHour);
    this.store.upsert(updated);
    this.store.recordReview(dayKey, grade === 1);
    return { updated, dayKey };
  }

  ungrade(card: Card, dayKey: string, wasAgain: boolean): void {
    if (!this.ensureWritable()) return;
    this.store.upsert({ ...card, updatedAt: Date.now() });
    this.store.undoReview(dayKey, wasAgain);
  }
}
