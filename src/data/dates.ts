/*
 * Canonical date model.
 *
 *  - A TIMESTAMP (completedAt, updatedAt, startedAt, ...) is an absolute instant, stored as an ISO string.
 *  - A CALENDAR DAY (scheduledDate, nutrition/recovery/measurement dates, "today") is a YYYY-MM-DD string in the
 *    user's LOCAL time zone.
 *  - Converting a timestamp to a calendar day always uses the local zone (dayOfTimestamp), never the UTC
 *    date of the ISO string. Calendar-day arithmetic never depends on the zone or on daylight saving.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar day of an instant (defaults to now). */
export function localDate(value: Date | number = new Date()): string {
  const d = typeof value === 'number' ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayLocal = (): string => localDate();

/** Whole days since 1970-01-01 for a calendar day. Zone independent. Undefined when invalid. */
export function dayNumber(day: string | undefined): number | undefined {
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return undefined;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86400000) : undefined;
}

/** Add whole calendar days to a calendar day. Zone and DST independent. */
export function addDaysLocal(day: string, days: number): string {
  const n = dayNumber(day);
  if (n === undefined || !Number.isFinite(days)) return day;
  return new Date((n + Math.trunc(days)) * 86400000).toISOString().slice(0, 10);
}

/**
 * The local calendar day a stored value refers to.
 * A plain YYYY-MM-DD is already a calendar day; an ISO timestamp is converted to the local zone.
 */
export function dayOfTimestamp(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (ISO_DAY.test(value)) return dayNumber(value) === undefined ? undefined : value;
  const t = new Date(value);
  return Number.isFinite(t.getTime()) ? localDate(t) : undefined;
}

/** Calendar day of a workout's actual exposure: when it was completed, else when it was scheduled. */
export function workoutDay(w: { completedAt?: string; scheduledDate: string }): string {
  return dayOfTimestamp(w.completedAt) ?? dayOfTimestamp(w.scheduledDate) ?? w.scheduledDate;
}
