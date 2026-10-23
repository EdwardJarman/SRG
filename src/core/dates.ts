export const DAY_MS = 86_400_000;

export function clampDayStartHour(hour: number): number {
  if (!Number.isFinite(hour)) return 4;
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

export function logicalDayStart(ts: number, dayStartHour: number): number {
  const hour = clampDayStartHour(dayStartHour);
  const date = new Date(ts);
  date.setHours(hour, 0, 0, 0);
  if (date.getTime() > ts) {
    date.setDate(date.getDate() - 1);
  }
  return date.getTime();
}

export function logicalDayEnd(ts: number, dayStartHour: number): number {
  const date = new Date(logicalDayStart(ts, dayStartHour));
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function logicalDayKey(ts: number, dayStartHour: number): string {
  return formatDayKey(new Date(logicalDayStart(ts, dayStartHour)));
}

export function dayKeyOffset(now: number, dayStartHour: number, offsetDays: number): string {
  const date = new Date(logicalDayStart(now, dayStartHour));
  date.setDate(date.getDate() + offsetDays);
  return formatDayKey(date);
}

export function shiftDayKey(dayKey: string, offsetDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return dayKey;
  date.setDate(date.getDate() + offsetDays);
  return formatDayKey(date);
}

export function isDayKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}
