import {
  addDays,
  compareLocalDates,
  LocalDate,
  parseClock,
  toLocalDate,
  WEEKDAY_LABELS,
  weekdayOf,
} from './appointment-date';

/**
 * Weekly repeat for an appointment, kept as the weekdays it falls on (0 = 일 … 6 = 토). An empty
 * list is a one-off. The matching `recurrence` text stays in the draft for the voice flow, which
 * shows and edits repeat as a sentence.
 */

export const NO_REPEAT_LABEL = '반복 없음';

export type RepeatPreset = { id: 'daily' | 'weekdays' | 'weekend'; label: string; days: number[] };

export const REPEAT_PRESETS: readonly RepeatPreset[] = [
  { id: 'daily', label: '매일', days: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'weekdays', label: '평일', days: [1, 2, 3, 4, 5] },
  { id: 'weekend', label: '주말', days: [0, 6] },
];

export function isRepeatWeekdayList(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

/** Sorted and deduplicated, so `[5, 1, 1]` and `[1, 5]` describe the same repeat. */
export function normalizeRepeatWeekdays(value: unknown): number[] {
  if (!isRepeatWeekdayList(value)) return [];
  return [...new Set(value)].sort((left, right) => left - right);
}

export function toggleRepeatWeekday(days: readonly number[], day: number) {
  const current = normalizeRepeatWeekdays([...days]);
  return current.includes(day) ? current.filter((item) => item !== day) : normalizeRepeatWeekdays([...current, day]);
}

export function sameRepeatWeekdays(left: readonly number[], right: readonly number[]) {
  const a = normalizeRepeatWeekdays([...left]);
  const b = normalizeRepeatWeekdays([...right]);
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

export function matchingRepeatPreset(days: readonly number[]) {
  return REPEAT_PRESETS.find((preset) => sameRepeatWeekdays(preset.days, days)) ?? null;
}

/** `반복 없음`, `매일`, `평일마다`, `주말마다`, `매주 월·수·금`. */
export function describeRepeatWeekdays(days: readonly number[]) {
  const normalized = normalizeRepeatWeekdays([...days]);
  if (!normalized.length) return NO_REPEAT_LABEL;
  const preset = matchingRepeatPreset(normalized);
  if (preset?.id === 'daily') return '매일';
  if (preset?.id === 'weekdays') return '평일마다';
  if (preset?.id === 'weekend') return '주말마다';
  return `매주 ${normalized.map((day) => WEEKDAY_LABELS[day]).join('·')}`;
}

/**
 * Reads repeat the way someone says it — `매주 월·수·금`, `매일`, `평일`, `주말`, `월요일마다`.
 * Anything else, including `반복 없음`, is a one-off.
 */
export function parseRepeatWeekdaysText(text: string | undefined | null): number[] {
  const value = (text ?? '').trim();
  if (!value || value.includes('없음') || value.includes('안 함') || value.includes('한 번')) return [];
  if (value.includes('매일') || value.includes('날마다')) return [0, 1, 2, 3, 4, 5, 6];
  if (value.includes('평일')) return [1, 2, 3, 4, 5];
  if (value.includes('주말')) return [0, 6];
  // Dates such as `8월 23일` carry weekday characters of their own, so strip them before looking
  // for `월요일` or a `월·수·금` run. `매주` alone, with no weekday named, has nothing to repeat on.
  const cleaned = value.replace(/\d+\s*(?:월|일|주|시|분|년)/g, ' ');
  const found = new Set<number>();
  for (const match of cleaned.matchAll(/([일월화수목금토])요일/g)) found.add(weekdayIndex(match[1]));
  for (const match of cleaned.matchAll(/(?:^|[\s·,/])([일월화수목금토])(?=$|[\s·,/요])/g)) found.add(weekdayIndex(match[1]));
  return normalizeRepeatWeekdays([...found]);
}

function weekdayIndex(label: string) {
  return WEEKDAY_LABELS.indexOf(label as typeof WEEKDAY_LABELS[number]);
}

/**
 * The first day on or after `from` the appointment can fall on. With no repeat that is `from`
 * itself. With repeat, today only counts while its clock is still ahead of `now`, so picking 일요일
 * on a Sunday evening means next Sunday rather than an appointment that is already over.
 */
export function nextRepeatDate(
  days: readonly number[],
  from: LocalDate,
  clock: string,
  now: Date | number = Date.now(),
): LocalDate {
  const normalized = normalizeRepeatWeekdays([...days]);
  if (!normalized.length) return from;
  const reference = typeof now === 'number' ? now : now.getTime();
  const today = toLocalDate(reference);
  const parsed = parseClock(clock) ?? { hours: 0, minutes: 0 };
  let candidate = compareLocalDates(from, today) < 0 ? today : from;
  for (let step = 0; step < 8; step += 1) {
    const at = new Date(candidate.year, candidate.month, candidate.day, parsed.hours, parsed.minutes).getTime();
    if (normalized.includes(weekdayOf(candidate)) && at > reference) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

/** Where a repeating appointment goes after the occurrence on `after` has passed. */
export function nextRepeatDateAfter(
  days: readonly number[],
  after: LocalDate,
  clock: string,
  now: Date | number = Date.now(),
) {
  return nextRepeatDate(days, addDays(after, 1), clock, now);
}
