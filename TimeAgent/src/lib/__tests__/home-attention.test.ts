import { shouldAnimateHomeLogo } from '../home-attention';

describe('home attention logo', () => {
  test('지연이나 비·눈·천둥 메시지가 있을 때만 로고를 움직인다', () => {
    const base = { delayMinutes: 0, weatherIcon: 'clear' as const, weatherStatus: 'ready', calendarStatus: 'ready' };
    expect(shouldAnimateHomeLogo(base)).toBe(false);
    expect(shouldAnimateHomeLogo({ ...base, delayMinutes: 3 })).toBe(true);
    expect(shouldAnimateHomeLogo({ ...base, weatherIcon: 'rain' })).toBe(true);
    expect(shouldAnimateHomeLogo({ ...base, weatherIcon: 'snow' })).toBe(true);
    expect(shouldAnimateHomeLogo({ ...base, weatherIcon: 'storm' })).toBe(true);
  });

  test('날씨나 캘린더 오류도 확인 메시지로 처리한다', () => {
    const base = { delayMinutes: 0, weatherIcon: null, weatherStatus: 'ready', calendarStatus: 'ready' };
    expect(shouldAnimateHomeLogo({ ...base, weatherStatus: 'error' })).toBe(true);
    expect(shouldAnimateHomeLogo({ ...base, calendarStatus: 'error' })).toBe(true);
  });
});
