import { DAY_MS, logicalDayStart } from "./dates";
import { INITIAL_EASE } from "./scheduler";
import { Card } from "./types";

export function suspendCard(card: Card, now: number): Card {
  return { ...card, suspended: true, updatedAt: now };
}

export function resumeCard(card: Card, now: number): Card {
  return { ...card, suspended: false, updatedAt: now };
}

export function toggleSuspended(card: Card, now: number): Card {
  return card.suspended ? resumeCard(card, now) : suspendCard(card, now);
}

export function resetCard(card: Card, now: number): Card {
  return {
    ...card,
    reps: 0,
    lapses: 0,
    interval: 0,
    ease: INITIAL_EASE,
    due: now,
    lastReview: null,
    updatedAt: now,
  };
}

export function rescheduleCard(card: Card, due: number, now: number): Card {
  return { ...card, due, updatedAt: now };
}

export function postponeCard(card: Card, now: number, dayStartHour: number): Card {
  return rescheduleCard(card, logicalDayStart(now, dayStartHour) + DAY_MS, now);
}
