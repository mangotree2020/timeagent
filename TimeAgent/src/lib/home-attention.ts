export type PreparationCountdown = {
  /** Short enough to read at a glance on the home card. */
  label: string;
  /** Full sentence for screen readers, which cannot rely on the surrounding layout. */
  accessibilityLabel: string;
  tone: 'info' | 'warning' | 'success';
};

const MINUTE = 60_000;

/**
 * How long until it is time to start getting ready. The home card answers "when do I have to move?"
 * before it answers "when is the appointment", so this is the number people look for first.
 */
export function preparationCountdown(prepStartAt: number, now = Date.now()): PreparationCountdown {
  const remainingMinutes = Math.floor((prepStartAt - now) / MINUTE);

  if (remainingMinutes < 0) {
    const lateMinutes = Math.abs(remainingMinutes);
    return {
      label: lateMinutes < 60 ? `${lateMinutes}분 지남` : '준비 시작 시각 지남',
      accessibilityLabel: `준비 시작 시각이 ${lateMinutes < 60 ? `${lateMinutes}분` : '한 시간 이상'} 지났어요`,
      tone: 'warning',
    };
  }
  if (remainingMinutes === 0) {
    return { label: '지금 시작', accessibilityLabel: '지금 준비를 시작할 시각이에요', tone: 'success' };
  }
  if (remainingMinutes < 60) {
    return {
      label: `${remainingMinutes}분 뒤 시작`,
      accessibilityLabel: `준비 시작까지 ${remainingMinutes}분 남았어요`,
      // Under an hour there is no time to start something else, so it reads as a nudge.
      tone: remainingMinutes <= 10 ? 'warning' : 'info',
    };
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  if (hours < 24) {
    return {
      label: minutes === 0 ? `${hours}시간 뒤 시작` : `${hours}시간 ${minutes}분 뒤 시작`,
      accessibilityLabel: `준비 시작까지 ${hours}시간 ${minutes}분 남았어요`,
      tone: 'info',
    };
  }
  const days = Math.floor(hours / 24);
  return {
    label: `${days}일 뒤 시작`,
    accessibilityLabel: `준비 시작까지 ${days}일 남았어요`,
    tone: 'info',
  };
}
