/**
 * Date and clock values the appointment pickers read and write.
 *
 * A draft keeps its date as text because it is also dictated, imported from a calendar, and shown
 * back in plain Korean. The wheel and calendar pickers write an unambiguous `YYYY-MM-DD (요일)` so
 * a draft that sits for a few days still means the same day, while parsing keeps accepting the
 * spoken forms (`8월 27일 (목요일)`, `내일`) the voice flow produces.
 */

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type ClockParts = { period: '오전' | '오후'; hour12: number; minute: number };

export type LocalDate = { year: number; month: number; day: number };

export function parseClock(clock: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatClock(hours: number, minutes: number) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Splits `18:05` into the three wheels: 오후 · 6 · 05. Midnight is 오전 12, noon is 오후 12. */
export function clockToParts(clock: string): ClockParts {
  const parsed = parseClock(clock) ?? { hours: 9, minutes: 0 };
  return {
    period: parsed.hours < 12 ? '오전' : '오후',
    hour12: parsed.hours % 12 === 0 ? 12 : parsed.hours % 12,
    minute: parsed.minutes,
  };
}

export function partsToClock({ period, hour12, minute }: ClockParts) {
  const base = hour12 % 12;
  return formatClock(period === '오전' ? base : base + 12, minute);
}

/** `오후 6:05` — the spoken form used by the live region next to the wheels. */
export function describeClock(clock: string) {
  const { period, hour12, minute } = clockToParts(clock);
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`;
}

export function toLocalDate(date: Date | number): LocalDate {
  const value = typeof date === 'number' ? new Date(date) : date;
  return { year: value.getFullYear(), month: value.getMonth(), day: value.getDate() };
}

export function localDateToDate({ year, month, day }: LocalDate) {
  return new Date(year, month, day);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(new Date(date.year, date.month, date.day + days));
}

export function isSameLocalDate(left: LocalDate, right: LocalDate) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function compareLocalDates(left: LocalDate, right: LocalDate) {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function weekdayOf(date: LocalDate) {
  return localDateToDate(date).getDay();
}

/** The stored form: `2026-08-27 (목)`. */
export function formatAppointmentDateValue(date: LocalDate) {
  return `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')} (${WEEKDAY_LABELS[weekdayOf(date)]})`;
}

/** The spoken form: `오늘 · 8월 23일 (일)`, `내일 · 8월 24일 (월)`, `8월 27일 (목)`. */
export function describeAppointmentDate(date: LocalDate, now: Date | number = Date.now()) {
  const today = toLocalDate(now);
  const base = `${date.month + 1}월 ${date.day}일 (${WEEKDAY_LABELS[weekdayOf(date)]})`;
  if (isSameLocalDate(date, today)) return `오늘 · ${base}`;
  if (isSameLocalDate(date, addDays(today, 1))) return `내일 · ${base}`;
  return base;
}

/**
 * The stored `2026-08-27 (목)` shown the way people say it, `8월 27일 (목)`; any other text — a
 * dictated `내일`, a calendar import's bare ISO date — is shown as it is.
 */
export function describeAppointmentDateText(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) \(([일월화수목금토])\)$/.exec(text.trim());
  if (!match) return text;
  return `${Number(match[2])}월 ${Number(match[3])}일 (${match[4]})`;
}

/**
 * Reads every date text the app has ever written into a draft. `오늘`/`내일` win over a stale
 * month and day, an ISO date is taken as written, and a bare `M월 D일` that has already passed is
 * read as next year — the only sensible meaning for a dictated "10월 3일" in November.
 */
export function resolveAppointmentDate(text: string, now: Date | number = Date.now()): LocalDate {
  const today = toLocalDate(now);
  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  const korean = /(\d{1,2})월\s*(\d{1,2})일/.exec(text);
  if (text.includes('내일')) return addDays(today, 1);
  if (text.includes('오늘')) return today;
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  if (korean) {
    const candidate = { year: today.year, month: Number(korean[1]) - 1, day: Number(korean[2]) };
    const endOfCandidate = new Date(candidate.year, candidate.month, candidate.day, 23, 59, 59, 999).getTime();
    const reference = typeof now === 'number' ? now : now.getTime();
    return endOfCandidate < reference ? { ...candidate, year: candidate.year + 1 } : candidate;
  }
  return today;
}

export type CalendarCell = { date: LocalDate; inMonth: boolean; key: string };

/** Six rows of seven days, Sunday first, padded with the neighbouring months so the grid never jumps. */
export function calendarMonthGrid(year: number, month: number): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const start = addDays(toLocalDate(first), -first.getDay());
  const rows: CalendarCell[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const cells: CalendarCell[] = [];
    for (let column = 0; column < 7; column += 1) {
      const date = addDays(start, row * 7 + column);
      cells.push({ date, inMonth: date.month === month && date.year === year, key: `${date.year}-${date.month}-${date.day}` });
    }
    rows.push(cells);
  }
  return rows;
}

export function describeMonth(year: number, month: number) {
  return `${year}년 ${month + 1}월`;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const shifted = new Date(year, month + delta, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}
