export type Grade = 1 | 3 | 4 | 5;

export const GRADES: readonly Grade[] = [1, 3, 4, 5] as const;

export const GRADE_LABELS: Record<Grade, string> = {
  1: "Again",
  3: "Hard",
  4: "Good",
  5: "Easy",
};

export const GRADE_HOTKEYS: Record<Grade, string> = {
  1: "1",
  3: "2",
  4: "3",
  5: "4",
};

export type Anchor =
  | { type: "note" }
  | { type: "heading"; path: string[]; hash: string }
  | { type: "block"; blockId: string };

export interface Card {
  id: string;
  file: string;
  anchor: Anchor;
  title: string;
  created: number;
  reps: number;
  lapses: number;
  interval: number;
  ease: number;
  due: number;
  lastReview: number | null;
  firstReview: number | null;
  suspended: boolean;
  missing: boolean;
  updatedAt: number;
}

export interface DayStats {
  reviews: number;
  again: number;
}

export interface GardenData {
  version: number;
  cards: Record<string, Card>;
  daily: Record<string, DayStats>;
}

export interface GardenSettings {
  newCardsPerDay: number;
  dayStartHour: number;
  retentionWindowDays: number;
  burySiblings: boolean;
}

export const DEFAULT_SETTINGS: GardenSettings = {
  newCardsPerDay: 15,
  dayStartHour: 4,
  retentionWindowDays: 30,
  burySiblings: true,
};
