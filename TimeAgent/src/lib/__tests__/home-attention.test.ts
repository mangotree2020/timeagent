import { preparationCountdown, shouldAnimateHomeLogo } from '../home-attention';

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

describe('countdown to the preparation start', () => {
  const at = (isoLike: string) => new Date(`2026-08-16T${isoLike}:00+09:00`).getTime();
  const prepStart = at('14:00');

  it('counts down in the unit that matches how far away it is', () => {
    expect(preparationCountdown(prepStart, at('13:55')).label).toBe('5분 뒤 시작');
    expect(preparationCountdown(prepStart, at('12:30')).label).toBe('1시간 30분 뒤 시작');
    expect(preparationCountdown(prepStart, at('11:00')).label).toBe('3시간 뒤 시작');
    expect(preparationCountdown(prepStart, new Date('2026-08-14T14:00:00+09:00').getTime()).label).toBe('2일 뒤 시작');
  });

  it('calls out the moment to move and the moment it has passed', () => {
    expect(preparationCountdown(prepStart, at('14:00'))).toMatchObject({ label: '지금 시작', tone: 'success' });
    expect(preparationCountdown(prepStart, at('14:20'))).toMatchObject({ label: '20분 지남', tone: 'warning' });
    expect(preparationCountdown(prepStart, at('16:00')).label).toBe('준비 시작 시각 지남');
  });

  it('warns once there is no longer time to start something else', () => {
    expect(preparationCountdown(prepStart, at('13:52')).tone).toBe('warning');
    expect(preparationCountdown(prepStart, at('13:40')).tone).toBe('info');
  });

  it('describes the remaining time in a full sentence for screen readers', () => {
    expect(preparationCountdown(prepStart, at('13:55')).accessibilityLabel).toBe('준비 시작까지 5분 남았어요');
  });
});
