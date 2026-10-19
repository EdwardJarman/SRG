import { fnv1a32, mulberry32 } from "../utils/random";
import { DAY_MS, logicalDayStart } from "./dates";
import { Anchor, Card, Grade, GRADES } from "./types";

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;

export interface ApplyReviewOptions {
  now: number;
  dayStartHour: number;
  fuzz?: boolean;
}

export interface NewCardSpec {
  id: string;
  file: string;
  anchor: Anchor;
  title: string;
  now: number;
}

export function createCard(spec: NewCardSpec): Card {
  return {
    id: spec.id,
    file: spec.file,
    anchor: spec.anchor,
    title: spec.title,
    created: spec.now,
    reps: 0,
    lapses: 0,
    interval: 0,
    ease: INITIAL_EASE,
    due: spec.now,
    lastReview: null,
    firstReview: null,
    suspended: false,
    updatedAt: spec.now,
  };
}

export function clampEase(ease: number): number {
  if (!Number.isFinite(ease)) return INITIAL_EASE;
  return Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
}

export function easeDelta(grade: Grade): number {
  const distance = 5 - grade;
  return 0.1 - distance * (0.08 + distance * 0.02);
}

export function fuzzInterval(cardId: string, interval: number): number {
  const rng = mulberry32(fnv1a32(`${cardId}:${interval}`));
  const factor = 0.95 + rng() * 0.1;
  return Math.max(1, Math.round(interval * factor));
}

export function applyReview(card: Card, grade: Grade, options: ApplyReviewOptions): Card {
  const { now, dayStartHour } = options;
  const fuzz = options.fuzz ?? true;
  const nextEase = clampEase(card.ease + easeDelta(grade));

  let reps: number;
  let lapses = card.lapses;
  let interval: number;

  if (grade === 1) {
    reps = 0;
    lapses += 1;
    interval = 1;
  } else {
    reps = card.reps + 1;
    if (reps === 1) {
      interval = 1;
    } else if (reps === 2) {
      interval = 6;
    } else if (grade === 3) {
      interval = Math.max(card.interval + 1, Math.round(card.interval * 1.2));
    } else {
      interval = Math.max(card.interval + 1, Math.round(card.interval * card.ease));
    }
    if (fuzz && interval > 2) {
      interval = fuzzInterval(card.id, interval);
    }
  }

  return {
    ...card,
    reps,
    lapses,
    interval,
    ease: nextEase,
    due: logicalDayStart(now, dayStartHour) + interval * DAY_MS,
    lastReview: now,
    firstReview: card.firstReview ?? now,
    updatedAt: now,
  };
}

export function previewIntervals(card: Card, now: number, dayStartHour: number): Record<Grade, number> {
  const result = {} as Record<Grade, number>;
  for (const grade of GRADES) {
    result[grade] = applyReview(card, grade, { now, dayStartHour, fuzz: false }).interval;
  }
  return result;
}
