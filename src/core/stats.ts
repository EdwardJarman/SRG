import { DAY_MS, dayKeyOffset, logicalDayEnd, logicalDayKey, logicalDayStart } from "./dates";
import { Card, DayStats, GardenSettings } from "./types";

export interface StatsSummary {
  due: number;
  newCards: number;
  streak: number;
  retention: number | null;
}

export function countDue(cards: Card[], now: number, dayStartHour: number): number {
  const end = logicalDayEnd(now, dayStartHour);
  return cards.filter((card) => !card.suspended && !card.missing && card.due < end).length;
}

export function overdueDays(due: number, now: number, dayStartHour: number): number {
  return Math.max(0, Math.round((logicalDayStart(now, dayStartHour) - due) / DAY_MS));
}

export function buildQueue(cards: Card[], now: number, dayStartHour: number, newCardsPerDay: number): Card[] {
  const active = cards.filter((card) => !card.suspended && !card.missing);
  const end = logicalDayEnd(now, dayStartHour);

  // Anything that has been seen before and is due counts as a review, even if
  // it lapsed and came back to zero reps.
  const reviewable = active
    .filter((card) => card.due < end && (card.reps > 0 || card.firstReview !== null))
    .sort((a, b) => a.due - b.due || a.created - b.created);

  const todayKey = logicalDayKey(now, dayStartHour);
  const introducedToday = active.filter(
    (card) => card.firstReview !== null && logicalDayKey(card.firstReview, dayStartHour) === todayKey,
  ).length;
  const quota = Math.max(0, newCardsPerDay - introducedToday);

  // Only cards that have never been reviewed are held back by the quota, so a
  // card that lapsed never takes a slot meant for a new one.
  const fresh = active
    .filter((card) => card.firstReview === null)
    .sort((a, b) => a.created - b.created)
    .slice(0, quota);

  return [...reviewable, ...fresh];
}

export function computeStreak(daily: Record<string, DayStats>, now: number, dayStartHour: number): number {
  const hasReviews = (offset: number): boolean => {
    const stats = daily[dayKeyOffset(now, dayStartHour, offset)];
    return stats !== undefined && stats.reviews > 0;
  };

  let streak = 0;
  let offset = hasReviews(0) ? 0 : -1;
  while (hasReviews(offset)) {
    streak += 1;
    offset -= 1;
  }
  return streak;
}

export function computeRetention(
  daily: Record<string, DayStats>,
  windowDays: number,
  now: number,
  dayStartHour: number,
): number | null {
  let reviews = 0;
  let again = 0;
  for (let offset = 0; offset < windowDays; offset++) {
    const stats = daily[dayKeyOffset(now, dayStartHour, -offset)];
    if (stats) {
      reviews += stats.reviews;
      again += stats.again;
    }
  }
  if (reviews === 0) return null;
  return Math.max(0, Math.min(1, 1 - again / reviews));
}

export function computeStats(
  cards: Card[],
  daily: Record<string, DayStats>,
  now: number,
  settings: GardenSettings,
): StatsSummary {
  return {
    due: countDue(cards, now, settings.dayStartHour),
    newCards: cards.filter((card) => !card.suspended && card.reps === 0).length,
    streak: computeStreak(daily, now, settings.dayStartHour),
    retention: computeRetention(daily, settings.retentionWindowDays, now, settings.dayStartHour),
  };
}
