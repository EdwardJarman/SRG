import { isDayKey, shiftDayKey } from "./dates";
import { clampEase, INITIAL_EASE } from "./scheduler";
import { Anchor, Card, DayStats, GardenData, WriterStats } from "./types";

export const DATA_VERSION = 3;

export const DAILY_HISTORY_DAYS = 1100;

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

export function emptyGardenData(): GardenData {
  return {
    version: DATA_VERSION,
    cards: {},
    daily: {},
    writers: {},
    deleted: {},
    resetAt: 0,
  };
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return sorted;
}

function sortedWriters(writers: WriterStats): WriterStats {
  const sorted: WriterStats = {};
  for (const writerId of Object.keys(writers).sort()) {
    sorted[writerId] = sortedRecord(writers[writerId]);
  }
  return sorted;
}

export function serializeGardenData(data: GardenData, compact = false): string {
  const ordered: GardenData = {
    version: data.version,
    cards: sortedRecord(data.cards),
    daily: sortedRecord(data.daily),
    writers: sortedWriters(data.writers),
    deleted: sortedRecord(data.deleted),
    resetAt: data.resetAt,
  };
  return compact ? JSON.stringify(ordered) : JSON.stringify(ordered, null, 1);
}

export function deserializeGardenData(raw: string): GardenData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return sanitizeGardenData(parsed);
}

export function sanitizeGardenData(input: unknown): GardenData | null {
  if (!isRecord(input)) return null;

  if (input.version !== undefined) {
    if (
      typeof input.version !== "number" ||
      !Number.isInteger(input.version) ||
      input.version < 1 ||
      input.version > DATA_VERSION
    ) {
      return null;
    }
  }

  if (input.cards !== undefined && !isRecord(input.cards)) return null;
  if (input.daily !== undefined && !isRecord(input.daily)) return null;

  const cards: Record<string, Card> = {};
  const cardsInput = isRecord(input.cards) ? input.cards : {};
  for (const [id, rawCard] of Object.entries(cardsInput)) {
    if (!isSafeKey(id)) continue;
    const card = sanitizeCard(id, rawCard);
    if (card) cards[id] = card;
  }

  const daily: Record<string, DayStats> = {};
  const dailyInput = isRecord(input.daily) ? input.daily : {};
  for (const [key, rawDay] of Object.entries(dailyInput)) {
    if (!isDayKey(key) || !isRecord(rawDay)) continue;
    const reviews = toNonNegativeInt(rawDay.reviews, 0);
    const again = Math.min(reviews, toNonNegativeInt(rawDay.again, 0));
    if (reviews > 0) daily[key] = { reviews, again };
  }

  const writers = sanitizeWriters(input.writers);
  const deleted = sanitizeDeleted(input.deleted);
  const resetAt = toNonNegativeTimestamp(input.resetAt, 0);
  for (const [id, timestamp] of Object.entries(deleted)) {
    if (resetAt > 0 && timestamp <= resetAt) delete deleted[id];
  }
  for (const [id, card] of Object.entries(cards)) {
    if (resetAt > 0 && card.created <= resetAt) delete cards[id];
  }

  const hasWriterStats = Object.keys(writers).length > 0;
  const migratedWriters = hasWriterStats ? writers : writerStatsFromDaily(daily);
  return {
    version: DATA_VERSION,
    cards,
    daily: aggregateWriterStats(migratedWriters),
    writers: migratedWriters,
    deleted,
    resetAt,
  };
}

function sanitizeWriters(raw: unknown): WriterStats {
  if (!isRecord(raw)) return {};
  const writers: WriterStats = {};
  for (const [writerId, rawDays] of Object.entries(raw)) {
    if (!isSafeKey(writerId) || !isRecord(rawDays)) continue;
    const days: Record<string, DayStats> = {};
    for (const [key, rawDay] of Object.entries(rawDays)) {
      if (!isDayKey(key) || !isRecord(rawDay)) continue;
      const reviews = toNonNegativeInt(rawDay.reviews, 0);
      const again = Math.min(reviews, toNonNegativeInt(rawDay.again, 0));
      if (reviews > 0) days[key] = { reviews, again };
    }
    if (Object.keys(days).length > 0) writers[writerId] = days;
  }
  return writers;
}

function sanitizeDeleted(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const deleted: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isSafeKey(id)) continue;
    const timestamp = toNonNegativeTimestamp(value, 0);
    if (timestamp > 0) deleted[id] = timestamp;
  }
  return deleted;
}

export function writerStatsFromDaily(daily: Record<string, DayStats>): WriterStats {
  if (Object.keys(daily).length === 0) return {};
  const writers: WriterStats = { legacy: {} };
  for (const [key, stats] of Object.entries(daily)) {
    writers.legacy[key] = { reviews: stats.reviews, again: stats.again };
  }
  return writers;
}

export function aggregateWriterStats(writers: WriterStats): Record<string, DayStats> {
  const aggregated: Record<string, DayStats> = {};
  for (const days of Object.values(writers)) {
    for (const [key, stats] of Object.entries(days)) {
      const entry = aggregated[key] ?? { reviews: 0, again: 0 };
      entry.reviews += stats.reviews;
      entry.again += stats.again;
      aggregated[key] = entry;
    }
  }
  for (const stats of Object.values(aggregated)) {
    stats.again = Math.min(stats.reviews, stats.again);
  }
  return aggregated;
}

export function normalizeWriterStats(data: GardenData): GardenData {
  const hasWriters = Object.keys(data.writers).length > 0;
  const writers = hasWriters ? data.writers : writerStatsFromDaily(data.daily);
  return { ...data, writers, daily: aggregateWriterStats(writers) };
}

function mergeWriterStats(a: WriterStats, b: WriterStats): WriterStats {
  const merged: WriterStats = {};
  for (const writerId of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const daysA = a[writerId] ?? {};
    const daysB = b[writerId] ?? {};
    const days: Record<string, DayStats> = {};
    for (const key of new Set([...Object.keys(daysA), ...Object.keys(daysB)])) {
      const fromA = daysA[key];
      const fromB = daysB[key];
      const reviews = Math.max(fromA?.reviews ?? 0, fromB?.reviews ?? 0);
      const again = Math.min(reviews, Math.max(fromA?.again ?? 0, fromB?.again ?? 0));
      if (reviews > 0) days[key] = { reviews, again };
    }
    if (Object.keys(days).length > 0) merged[writerId] = days;
  }
  return merged;
}

function newerCard(a: Card, b: Card): Card {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  const aJson = JSON.stringify(a);
  const bJson = JSON.stringify(b);
  return aJson >= bJson ? a : b;
}

export function mergeGardenData(a: GardenData, b: GardenData): GardenData {
  const normalizedA = normalizeWriterStats(a);
  const normalizedB = normalizeWriterStats(b);
  const resetAt = Math.max(normalizedA.resetAt, normalizedB.resetAt);

  const writersFromA = resetAt === 0 || normalizedA.resetAt === resetAt;
  const writersFromB = resetAt === 0 || normalizedB.resetAt === resetAt;
  const writers = mergeWriterStats(
    writersFromA ? normalizedA.writers : {},
    writersFromB ? normalizedB.writers : {},
  );

  const deleted: Record<string, number> = {};
  for (const source of [normalizedA.deleted, normalizedB.deleted]) {
    for (const [id, timestamp] of Object.entries(source)) {
      if (timestamp > resetAt) deleted[id] = Math.max(deleted[id] ?? 0, timestamp);
    }
  }

  const cards: Record<string, Card> = {};
  const ids = new Set([...Object.keys(normalizedA.cards), ...Object.keys(normalizedB.cards)]);
  for (const id of Array.from(ids).sort()) {
    if (deleted[id] !== undefined) continue;
    const fromA = normalizedA.cards[id];
    const fromB = normalizedB.cards[id];
    const card = !fromA ? fromB : !fromB ? fromA : newerCard(fromA, fromB);
    if (!card) continue;
    if (resetAt > 0 && card.created <= resetAt) continue;
    cards[id] = card;
  }

  return {
    version: DATA_VERSION,
    cards,
    daily: aggregateWriterStats(writers),
    writers,
    deleted,
    resetAt,
  };
}

export function pruneDaily(
  daily: Record<string, DayStats>,
  todayKey: string,
  keepDays = DAILY_HISTORY_DAYS,
): number {
  if (!isDayKey(todayKey)) return 0;
  const cutoff = shiftDayKey(todayKey, -Math.max(1, keepDays));
  let removed = 0;
  for (const key of Object.keys(daily)) {
    if (isDayKey(key) && key < cutoff) {
      delete daily[key];
      removed += 1;
    }
  }
  return removed;
}

export function pruneWriterStats(
  writers: WriterStats,
  todayKey: string,
  keepDays = DAILY_HISTORY_DAYS,
): number {
  if (!isDayKey(todayKey)) return 0;
  const cutoff = shiftDayKey(todayKey, -Math.max(1, keepDays));
  let removed = 0;
  for (const [writerId, days] of Object.entries(writers)) {
    for (const key of Object.keys(days)) {
      if (isDayKey(key) && key < cutoff) {
        delete days[key];
        removed += 1;
      }
    }
    if (Object.keys(days).length === 0) delete writers[writerId];
  }
  return removed;
}

function sanitizeCard(id: string, raw: unknown): Card | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.file !== "string" || raw.file.length === 0) return null;
  const anchor = sanitizeAnchor(raw.anchor);
  if (!anchor) return null;

  const created = toFiniteNumber(raw.created, 0);
  const due = toFiniteNumber(raw.due, created);
  const updatedAt = toFiniteNumber(raw.updatedAt, created);

  return {
    id,
    file: raw.file,
    anchor,
    title: typeof raw.title === "string" ? raw.title : "",
    created,
    reps: Math.max(0, Math.floor(toFiniteNumber(raw.reps, 0))),
    lapses: Math.max(0, Math.floor(toFiniteNumber(raw.lapses, 0))),
    interval: Math.max(0, Math.floor(toFiniteNumber(raw.interval, 0))),
    ease: clampEase(toFiniteNumber(raw.ease, INITIAL_EASE)),
    due,
    lastReview: toNullableTimestamp(raw.lastReview),
    firstReview: toNullableTimestamp(raw.firstReview),
    suspended: raw.suspended === true,
    missing: raw.missing === true,
    orphaned: raw.orphaned === true,
    trashedAt: toNullableTimestamp(raw.trashedAt),
    updatedAt,
  };
}

function sanitizeAnchor(raw: unknown): Anchor | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "note") return { type: "note" };
  if (raw.type === "heading") {
    if (!Array.isArray(raw.path)) return null;
    const path: string[] = [];
    for (const entry of raw.path) {
      if (typeof entry !== "string") return null;
      path.push(entry);
    }
    if (path.length === 0) return null;
    return { type: "heading", path, hash: typeof raw.hash === "string" ? raw.hash : "" };
  }
  if (raw.type === "block") {
    if (typeof raw.blockId !== "string" || raw.blockId.length === 0) return null;
    return { type: "block", blockId: raw.blockId };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const number = toFiniteNumber(value, fallback);
  if (number < 0) return fallback;
  return Math.floor(number);
}

function toNullableTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNonNegativeTimestamp(value: unknown, fallback: number): number {
  const timestamp = toFiniteNumber(value, fallback);
  return timestamp > 0 ? timestamp : fallback;
}
