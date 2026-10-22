import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { logicalDayEnd } from "../core/dates";
import { ReviewSession } from "../core/reviewSession";
import { previewIntervals } from "../core/scheduler";
import { buildQueue, countDue, overdueDays } from "../core/stats";
import { Card, Grade, GRADES, GRADE_HOTKEYS, GRADE_LABELS } from "../core/types";
import { CardService } from "../services/cardService";
import { resolveCard } from "../vault/resolver";

function formatDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export class ReviewModal extends Modal {
  private readonly session: ReviewSession;
  private revealed = false;
  private blocked = false;
  private pendingAnswer: string | null = null;
  private renderComponent = new Component();
  private gradeButtons = new Map<Grade, HTMLButtonElement>();

  private metaLeftEl!: HTMLElement;
  private metaRightEl!: HTMLElement;
  private fileEl!: HTMLElement;
  private openNoteBtn!: HTMLButtonElement;
  private promptEl!: HTMLElement;
  private cardStateEl!: HTMLElement;
  private answerEl!: HTMLElement;
  private showBtn!: HTMLButtonElement;
  private gradesEl!: HTMLElement;
  private secondaryEl!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private postponeBtn!: HTMLButtonElement;
  private rescheduleBtn!: HTMLButtonElement;
  private errorEl!: HTMLElement;
  private summaryEl!: HTMLElement;

  constructor(
    app: App,
    private readonly service: CardService,
    initialQueue?: Card[],
  ) {
    super(app);
    const queue =
      initialQueue && initialQueue.length > 0
        ? initialQueue
        : buildQueue(
            service.getCards(),
            Date.now(),
            service.getSettings().dayStartHour,
            service.getSettings().newCardsPerDay,
          );
    this.session = new ReviewSession(service, queue);
  }

  onOpen(): void {
    this.renderComponent.load();
    this.modalEl.addClass("srg-modal");
    this.titleEl.setText("Garden review");

    const root = this.contentEl;
    root.addClass("srg-review");

    const meta = root.createDiv({ cls: "srg-meta" });
    this.metaLeftEl = meta.createDiv({ cls: "srg-meta-left" });
    this.fileEl = this.metaLeftEl.createSpan({ cls: "srg-meta-file" });
    this.openNoteBtn = this.metaLeftEl.createEl("button", { cls: "srg-link-btn", text: "Open note" });
    this.openNoteBtn.addEventListener("click", () => {
      const current = this.session.current;
      if (current) this.service.openNote(current);
    });
    this.metaRightEl = meta.createSpan({ cls: "srg-meta-right" });

    this.promptEl = root.createDiv({ cls: "srg-prompt" });
    this.cardStateEl = root.createDiv({ cls: "srg-cardstate" });
    this.answerEl = root.createDiv({ cls: "srg-answer srg-hidden" });

    this.showBtn = root.createEl("button", { text: "Show answer (Space)", cls: "srg-show srg-full" });
    this.showBtn.addEventListener("click", () => void this.reveal());

    this.gradesEl = root.createDiv({ cls: "srg-actions srg-hidden" });
    for (const grade of GRADES) {
      const button = this.gradesEl.createEl("button", {
        cls: `srg-grade srg-grade-${GRADE_LABELS[grade].toLowerCase()}`,
      });
      button.addEventListener("click", () => this.handleGrade(grade));
      this.gradeButtons.set(grade, button);
    }

    this.secondaryEl = root.createDiv({ cls: "srg-secondary srg-hidden" });
    this.undoBtn = this.secondaryEl.createEl("button", { text: "Undo last grade" });
    this.undoBtn.addEventListener("click", () => this.undoLastGrade());
    this.postponeBtn = this.secondaryEl.createEl("button", { text: "Not today" });
    this.postponeBtn.addEventListener("click", () => this.postponeCurrent());
    this.rescheduleBtn = this.secondaryEl.createEl("button", { text: "Reschedule..." });
    this.rescheduleBtn.addEventListener("click", () => this.rescheduleCurrent());

    this.errorEl = root.createDiv({ cls: "srg-error srg-hidden" });
    this.summaryEl = root.createDiv({ cls: "srg-summary srg-hidden" });

    const handleSpace = (evt: KeyboardEvent): boolean => {
      evt.preventDefault();
      this.handlePrimary();
      return false;
    };
    this.scope.register([], "Space", handleSpace);
    this.scope.register([], " ", handleSpace);
    this.scope.register([], "Enter", handleSpace);
    for (const grade of GRADES) {
      this.scope.register([], GRADE_HOTKEYS[grade], (evt) => {
        evt.preventDefault();
        this.handleGrade(grade);
        return false;
      });
    }
    this.scope.register(["Mod"], "z", (evt) => {
      evt.preventDefault();
      this.undoLastGrade();
      return false;
    });

    void this.showNext();
  }

  onClose(): void {
    this.renderComponent.unload();
    this.service.flush();
  }

  private handlePrimary(): void {
    if (!this.summaryEl.hasClass("srg-hidden")) {
      this.close();
      return;
    }
    void this.reveal();
  }

  private async reveal(): Promise<void> {
    if (this.revealed || this.blocked || !this.session.current) return;
    this.revealed = true;
    this.showBtn.addClass("srg-hidden");
    this.gradesEl.removeClass("srg-hidden");
    this.answerEl.removeClass("srg-hidden");
    this.answerEl.empty();

    const card = this.session.current;
    const answer = this.pendingAnswer ?? "(No content.)";
    try {
      await MarkdownRenderer.render(this.app, answer, this.answerEl, card.file, this.renderComponent);
    } catch (error) {
      console.error("[Spaced Repetition Garden] Failed to render answer:", error);
      this.answerEl.setText(answer);
    }

    const previews = previewIntervals(card, Date.now(), this.service.getSettings().dayStartHour);
    for (const grade of GRADES) {
      const button = this.gradeButtons.get(grade);
      if (button) button.setText(`${GRADE_LABELS[grade]} · ${formatDays(previews[grade])}`);
    }
  }

  private async showNext(): Promise<void> {
    this.revealed = false;
    this.blocked = false;
    this.pendingAnswer = null;

    const next = this.session.next();
    if (!next) {
      this.renderSummary();
      return;
    }

    this.summaryEl.addClass("srg-hidden");
    this.answerEl.empty();
    this.answerEl.addClass("srg-hidden");
    this.gradesEl.addClass("srg-hidden");
    this.errorEl.addClass("srg-hidden");
    this.errorEl.empty();
    this.showBtn.removeClass("srg-hidden");
    this.secondaryEl.removeClass("srg-hidden");
    this.postponeBtn.removeClass("srg-hidden");
    this.rescheduleBtn.removeClass("srg-hidden");
    this.updateUndoButton();

    this.promptEl.setText("...");
    this.cardStateEl.setText("");
    this.fileEl.setText(next.file);
    this.openNoteBtn.removeClass("srg-hidden");
    const remaining = this.session.remaining + 1;
    this.metaRightEl.setText(remaining === 1 ? "1 to review" : `${remaining} to review`);

    const resolved = await resolveCard(this.app, next);
    if (this.session.current !== next) return;

    if (resolved.status === "ok") {
      if (resolved.relink) {
        this.service.relink(next, resolved.relink.anchor, resolved.relink.title);
      }
      this.service.clearMissing(next);
      this.promptEl.setText(resolved.prompt);
      this.pendingAnswer = resolved.answer;
      this.cardStateEl.setText(this.describeState(next));
      return;
    }

    this.blocked = true;
    this.promptEl.setText(next.title || next.file);
    this.showBtn.addClass("srg-hidden");
    this.postponeBtn.addClass("srg-hidden");
    this.rescheduleBtn.addClass("srg-hidden");
    const message =
      resolved.status === "missing-file"
        ? "The note for this plant is missing. It may have been moved, renamed or deleted."
        : "This plant's heading is gone from its note.";
    this.errorEl.removeClass("srg-hidden");
    this.errorEl.createEl("div", { text: message });
    const actions = this.errorEl.createDiv({ cls: "srg-error-actions" });
    const skip = actions.createEl("button", { text: "Skip for now" });
    skip.addEventListener("click", () => void this.showNext());
    const remove = actions.createEl("button", { text: "Remove plant" });
    remove.addEventListener("click", () => {
      this.service.remove(next, () => void this.showNext());
    });
  }

  private describeState(card: Card): string {
    const settings = this.service.getSettings();
    const now = Date.now();
    if (card.reps === 0) return "A fresh seed - first review.";
    const late = overdueDays(card.due, now, settings.dayStartHour);
    const dueText =
      late > 0
        ? `Overdue ${late}d`
        : card.due < logicalDayEnd(now, settings.dayStartHour)
          ? "Due today"
          : "Scheduled ahead";
    return `Interval ${card.interval}d · Ease ${card.ease.toFixed(2)} · ${dueText}`;
  }

  private handleGrade(grade: Grade): void {
    if (!this.revealed || this.blocked || !this.session.current) return;
    this.session.grade(grade, Date.now());
    this.updateUndoButton();
    void this.showNext();
  }

  private undoLastGrade(): void {
    if (!this.session.undo()) return;
    this.updateUndoButton();
    void this.showNext();
  }

  private postponeCurrent(): void {
    if (this.blocked) return;
    this.session.postpone();
    void this.showNext();
  }

  private rescheduleCurrent(): void {
    const current = this.session.current;
    if (!current) return;
    this.service.rescheduleWith(current, (due) => this.session.reschedule(due));
  }

  private updateUndoButton(): void {
    if (!this.undoBtn) return;
    if (this.session.canUndo) this.undoBtn.removeClass("srg-hidden");
    else this.undoBtn.addClass("srg-hidden");
  }

  private renderSummary(): void {
    this.revealed = false;
    this.promptEl.setText("");
    this.cardStateEl.setText("");
    this.answerEl.empty();
    this.answerEl.addClass("srg-hidden");
    this.gradesEl.addClass("srg-hidden");
    this.showBtn.addClass("srg-hidden");
    this.errorEl.addClass("srg-hidden");
    this.secondaryEl.removeClass("srg-hidden");
    this.postponeBtn.addClass("srg-hidden");
    this.rescheduleBtn.addClass("srg-hidden");
    this.updateUndoButton();
    this.fileEl.setText("");
    this.openNoteBtn.addClass("srg-hidden");
    this.metaRightEl.setText("Session complete");

    this.summaryEl.empty();
    this.summaryEl.removeClass("srg-hidden");

    const settings = this.service.getSettings();
    const due = countDue(this.service.getCards(), Date.now(), settings.dayStartHour);
    this.summaryEl.createEl("div", {
      text: `Reviewed ${this.session.reviewed} ${
        this.session.reviewed === 1 ? "plant" : "plants"
      }${
        this.session.again > 0 ? `, ${this.session.again} sent back to the soil` : ""
      }${this.session.postponed > 0 ? `, ${this.session.postponed} put off for later` : ""}.`,
      cls: "srg-summary-title",
    });
    this.summaryEl.createDiv({
      text:
        due === 0
          ? "Every plant is tended - nothing is due today."
          : `${due} ${due === 1 ? "plant is" : "plants are"} still due today.`,
      cls: "srg-summary-sub",
    });
    const close = this.summaryEl.createEl("button", { text: "Close", cls: "mod-cta" });
    close.addEventListener("click", () => this.close());
  }
}
