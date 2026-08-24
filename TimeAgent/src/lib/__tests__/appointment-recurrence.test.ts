import {
  describeRepeatWeekdays,
  matchingRepeatPreset,
  nextRepeatDate,
  nextRepeatDateAfter,
  normalizeRepeatWeekdays,
  parseRepeatWeekdaysText,
  toggleRepeatWeekday,
} from '../appointment-recurrence';

const sundayNoon = new Date(2026, 7, 23, 12, 0); // 2026-08-23 (일)

describe('repeat weekdays', () => {
  test('normalises to a sorted unique list and rejects anything else', () => {
    expect(normalizeRepeatWeekdays([5, 1, 1])).toEqual([1, 5]);
    expect(normalizeRepeatWeekdays([7])).toEqual([]);
    expect(normalizeRepeatWeekdays('월')).toEqual([]);
  });

  test('toggles a weekday on and off', () => {
    expect(toggleRepeatWeekday([], 1)).toEqual([1]);
    expect(toggleRepeatWeekday([1, 3], 3)).toEqual([1]);
    expect(toggleRepeatWeekday([3], 1)).toEqual([1, 3]);
  });

  test('describes the repeat in words and recognises the presets', () => {
    expect(describeRepeatWeekdays([])).toBe('반복 없음');
    expect(describeRepeatWeekdays([1, 3, 5])).toBe('매주 월·수·금');
    expect(describeRepeatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('매일');
    expect(describeRepeatWeekdays([1, 2, 3, 4, 5])).toBe('평일마다');
    expect(describeRepeatWeekdays([6, 0])).toBe('주말마다');
    expect(matchingRepeatPreset([0, 6])?.id).toBe('weekend');
    expect(matchingRepeatPreset([0])).toBeNull();
  });

  test('reads repeat the way the voice flow writes it', () => {
    expect(parseRepeatWeekdaysText('반복 없음')).toEqual([]);
    expect(parseRepeatWeekdaysText(undefined)).toEqual([]);
    expect(parseRepeatWeekdaysText('매일')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseRepeatWeekdaysText('평일마다')).toEqual([1, 2, 3, 4, 5]);
    expect(parseRepeatWeekdaysText('주말')).toEqual([0, 6]);
    expect(parseRepeatWeekdaysText('매주 월·수·금')).toEqual([1, 3, 5]);
    expect(parseRepeatWeekdaysText('월요일마다')).toEqual([1]);
    expect(parseRepeatWeekdaysText('매주 화, 목')).toEqual([2, 4]);
    // A date is not a weekday, and `매주` alone names nothing.
    expect(parseRepeatWeekdaysText('매월 23일')).toEqual([]);
    expect(parseRepeatWeekdaysText('매주')).toEqual([]);
  });
});

describe('next repeat date', () => {
  test('keeps the chosen date when nothing repeats', () => {
    expect(nextRepeatDate([], { year: 2026, month: 7, day: 25 }, '09:00', sundayNoon)).toEqual({ year: 2026, month: 7, day: 25 });
  });

  test('moves a chosen date forward to the first repeat weekday', () => {
    expect(nextRepeatDate([2, 4], { year: 2026, month: 7, day: 23 }, '09:00', sundayNoon)).toEqual({ year: 2026, month: 7, day: 25 });
  });

  test('skips today when its clock has already passed', () => {
    expect(nextRepeatDate([0], { year: 2026, month: 7, day: 23 }, '09:00', sundayNoon)).toEqual({ year: 2026, month: 7, day: 30 });
    expect(nextRepeatDate([0], { year: 2026, month: 7, day: 23 }, '18:00', sundayNoon)).toEqual({ year: 2026, month: 7, day: 23 });
  });

  test('never starts in the past, even from a stale draft date', () => {
    expect(nextRepeatDate([1], { year: 2026, month: 6, day: 1 }, '09:00', sundayNoon)).toEqual({ year: 2026, month: 7, day: 24 });
  });

  test('finds the occurrence after a finished one, catching up when the app was away', () => {
    expect(nextRepeatDateAfter([1, 3, 5], { year: 2026, month: 7, day: 24 }, '09:00', new Date(2026, 7, 24, 10, 0))).toEqual({ year: 2026, month: 7, day: 26 });
    // Three weeks later the series resumes from now rather than replaying missed weeks.
    expect(nextRepeatDateAfter([1], { year: 2026, month: 7, day: 24 }, '09:00', new Date(2026, 8, 15, 10, 0))).toEqual({ year: 2026, month: 8, day: 21 });
  });
});
