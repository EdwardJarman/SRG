import { clampEase, INITIAL_EASE } from "./scheduler";
import { Anchor, Card, DayStats, GardenData } from "./types";

export const DATA_VERSION = 1;

export function emptyGardenData(): GardenData {
  return { version: DATA_VERSION, cards: {}, daily: {} };
}

export function serializeGardenData(data: GardenData): string {
  return JSON.stringify(data, null, 1);
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
    const card = sanitizeCard(id, rawCard);
    if (card) cards[id] = card;
  }

  const daily: Record<string, DayStats> = {};
  const dailyInput = isRecord(input.daily) ? input.daily : {};
  for (const [key, rawDay] of Object.entries(dailyInput)) {
    if (!isRecord(rawDay)) continue;
    const reviews = toNonNegativeInt(rawDay.reviews, 0);
    const again = Math.min(reviews, toNonNegativeInt(rawDay.again, 0));
    if (reviews > 0) daily[key] = { reviews, again };
  }

  return { version: DATA_VERSION, cards, daily };
}

export function mergeGardenData(a: GardenData, b: GardenData): GardenData {
  const cards: Record<string, Card> = { ...a.cards };
  for (const [id, card] of Object.entries(b.cards)) {
    const existing = cards[id];
    if (!existing || card.updatedAt >= existing.updatedAt) cards[id] = card;
  }

  const daily: Record<string, DayStats> = {};
  const keys = new Set([...Object.keys(a.daily), ...Object.keys(b.daily)]);
  for (const key of keys) {
    const fromA = a.daily[key];
    const fromB = b.daily[key];
    daily[key] = {
      reviews: Math.max(fromA?.reviews ?? 0, fromB?.reviews ?? 0),
      again: Math.max(fromA?.again ?? 0, fromB?.again ?? 0),
    };
  }

  return { version: DATA_VERSION, cards, daily };
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
