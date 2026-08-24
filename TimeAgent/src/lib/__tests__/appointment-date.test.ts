import {
  calendarMonthGrid,
  clockToParts,
  describeAppointmentDate,
  describeAppointmentDateText,
  describeClock,
  describeMonth,
  formatAppointmentDateValue,
  partsToClock,
  resolveAppointmentDate,
  shiftMonth,
} from '../appointment-date';

const sunday = new Date(2026, 7, 23, 12, 35); // 2026-08-23 (일)

describe('clock wheels', () => {
  test('splits a 24-hour clock into 오전/오후, 12-hour and minute wheels', () => {
    expect(clockToParts('18:05')).toEqual({ period: '오후', hour12: 6, minute: 5 });
    expect(clockToParts('00:30')).toEqual({ period: '오전', hour12: 12, minute: 30 });
    expect(clockToParts('12:00')).toEqual({ period: '오후', hour12: 12, minute: 0 });
    expect(clockToParts('nonsense')).toEqual({ period: '오전', hour12: 9, minute: 0 });
  });

  test('joins the wheels back into the stored HH:MM clock', () => {
    expect(partsToClock({ period: '오후', hour12: 6, minute: 5 })).toBe('18:05');
    expect(partsToClock({ period: '오전', hour12: 12, minute: 30 })).toBe('00:30');
    expect(partsToClock({ period: '오후', hour12: 12, minute: 0 })).toBe('12:00');
    expect(partsToClock(clockToParts('23:59'))).toBe('23:59');
  });

  test('reads the clock aloud the way the wheels show it', () => {
    expect(describeClock('18:05')).toBe('오후 6:05');
    expect(describeClock('00:00')).toBe('오전 12:00');
  });
});

describe('appointment date text', () => {
  test('writes an unambiguous date with its weekday and reads it back', () => {
    const value = formatAppointmentDateValue({ year: 2026, month: 7, day: 27 });
    expect(value).toBe('2026-08-27 (목)');
    expect(resolveAppointmentDate(value, sunday)).toEqual({ year: 2026, month: 7, day: 27 });
  });

  test('describes today and tomorrow relative to now', () => {
    expect(describeAppointmentDate({ year: 2026, month: 7, day: 23 }, sunday)).toBe('오늘 · 8월 23일 (일)');
    expect(describeAppointmentDate({ year: 2026, month: 7, day: 24 }, sunday)).toBe('내일 · 8월 24일 (월)');
    expect(describeAppointmentDate({ year: 2026, month: 7, day: 27 }, sunday)).toBe('8월 27일 (목)');
  });

  test('shows the stored form the way people say it and leaves other text alone', () => {
    expect(describeAppointmentDateText('2026-08-27 (목)')).toBe('8월 27일 (목)');
    expect(describeAppointmentDateText('8월 23일 (오늘)')).toBe('8월 23일 (오늘)');
    expect(describeAppointmentDateText('2026-08-27')).toBe('2026-08-27');
    expect(describeAppointmentDateText('')).toBe('');
  });

  test('keeps reading the spoken and default draft forms', () => {
    expect(resolveAppointmentDate('8월 23일 (오늘)', sunday)).toEqual({ year: 2026, month: 7, day: 23 });
    expect(resolveAppointmentDate('8월 23일 (내일)', sunday)).toEqual({ year: 2026, month: 7, day: 24 });
    expect(resolveAppointmentDate('8월 27일 (목요일)', sunday)).toEqual({ year: 2026, month: 7, day: 27 });
    expect(resolveAppointmentDate('2026-09-01', sunday)).toEqual({ year: 2026, month: 8, day: 1 });
    // A bare month and day that has already passed means next year.
    expect(resolveAppointmentDate('3월 1일', sunday)).toEqual({ year: 2027, month: 2, day: 1 });
    expect(resolveAppointmentDate('', sunday)).toEqual({ year: 2026, month: 7, day: 23 });
  });
});

describe('calendar grid', () => {
  test('lays out six Sunday-first weeks padded with the neighbouring months', () => {
    const grid = calendarMonthGrid(2026, 7);
    expect(grid).toHaveLength(6);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    // August 2026 starts on a Saturday, so the first row holds six days of July.
    expect(grid[0][0].date).toEqual({ year: 2026, month: 6, day: 26 });
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][6].date).toEqual({ year: 2026, month: 7, day: 1 });
    expect(grid[0][6].inMonth).toBe(true);
    expect(grid[5][6].date).toEqual({ year: 2026, month: 8, day: 5 });
  });

  test('names and shifts months across a year boundary', () => {
    expect(describeMonth(2026, 11)).toBe('2026년 12월');
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});
