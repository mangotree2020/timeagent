import { arrivalStatus, formatCountdown, shiftClock } from '../schedule';

describe('schedule helpers', () => {
  test('formats a countdown without negative values', () => {
    expect(formatCountdown(462)).toBe('07:42');
    expect(formatCountdown(-1)).toBe('00:00');
  });

  test('shifts a clock across midnight', () => {
    expect(shiftClock('23:58', 5)).toBe('00:03');
    expect(shiftClock('00:02', -5)).toBe('23:57');
  });

  test('labels early and late arrivals with text, not color alone', () => {
    expect(arrivalStatus('13:56', '14:00')).toEqual({ tone: 'success', minutes: 4, label: '4분 여유' });
    expect(arrivalStatus('14:08', '14:00')).toEqual({ tone: 'danger', minutes: -8, label: '8분 지각 예상' });
  });
});

