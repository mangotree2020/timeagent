import { preparationCountdown } from '../home-attention';

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
