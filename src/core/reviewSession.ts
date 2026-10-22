import { Card, Grade, GardenSettings } from "./types";

export interface SessionHost {
  getCards(): Card[];
  getSettings(): GardenSettings;
  grade(card: Card, grade: Grade, now: number): { updated: Card; dayKey: string };
  ungrade(card: Card, dayKey: string, wasAgain: boolean): void;
  postpone(card: Card): void;
  rescheduleTo(card: Card, due: number): void;
}

export interface UndoEntry {
  card: Card;
  wasAgain: boolean;
  dayKey: string;
  buried: Card[];
}

const MAX_UNDO = 50;

export class ReviewSession {
  private queue: Card[];
  private undoStack: UndoEntry[] = [];
  private currentCard: Card | null = null;

  reviewed = 0;
  again = 0;
  postponed = 0;

  constructor(
    private readonly host: SessionHost,
    initialQueue: Card[],
  ) {
    this.queue = [...initialQueue];
  }

  get current(): Card | null {
    return this.currentCard;
  }

  get remaining(): number {
    return this.queue.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  next(): Card | null {
    const next = this.queue.shift() ?? null;
    this.currentCard = next;
    return next;
  }

  grade(grade: Grade, now: number): void {
    const current = this.currentCard;
    if (!current) return;

    const before = this.host.getCards().find((card) => card.id === current.id) ?? current;
    const { updated, dayKey } = this.host.grade(before, grade, now);
    this.reviewed += 1;

    let buried: Card[] = [];
    if (grade === 1) {
      this.again += 1;
      if (this.host.getSettings().burySiblings) {
        buried = this.burySiblings(before);
      }
      this.queue.push(updated);
    }

    this.undoStack.push({ card: before, wasAgain: grade === 1, dayKey, buried });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  undo(): boolean {
    const last = this.undoStack.pop();
    if (!last) return false;

    this.host.ungrade(last.card, last.dayKey, last.wasAgain);
    this.reviewed = Math.max(0, this.reviewed - 1);
    if (last.wasAgain) this.again = Math.max(0, this.again - 1);

    this.queue = this.queue.filter((entry) => entry.id !== last.card.id);
    this.queue.unshift(last.card, ...last.buried);
    return true;
  }

  postpone(): void {
    const current = this.currentCard;
    if (!current) return;
    this.host.postpone(current);
    this.postponed += 1;
  }

  reschedule(due: number): void {
    const current = this.currentCard;
    if (!current) return;
    this.host.rescheduleTo(current, due);
  }

  private burySiblings(card: Card): Card[] {
    const siblings = this.queue.filter((entry) => entry.file === card.file);
    if (siblings.length === 0) return [];
    this.queue = this.queue.filter((entry) => entry.file !== card.file);
    return siblings;
  }
}
