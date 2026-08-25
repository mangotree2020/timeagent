export type NextAlarmNotice = {
  /** How far away, on its own line: `31분 후`, `1시간 6분 후`, `1일 3시간 후`, or `지금`. */
  remaining: string;
  /** When exactly, the way the clock app says it: `8월 24일 (일) 오후 4:02`. */
  at: string;
};

/** The home top line, Galaxy-clock style: how long until the preparation alarm rings, and when. */
export function describeNextAlarm(prepStartAt: number, now = Date.now()): NextAlarmNotice {
  const alarm = new Date(prepStartAt);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][alarm.getDay()];
  const hours = alarm.getHours();
  const clock = `${hours < 12 ? '오전' : '오후'} ${hours % 12 === 0 ? 12 : hours % 12}:${String(alarm.getMinutes()).padStart(2, '0')}`;
  const at = `${alarm.getMonth() + 1}월 ${alarm.getDate()}일 (${weekday}) ${clock}`;
  const remaining = Math.floor((prepStartAt - now) / MINUTE);
  if (remaining < 1) return { remaining: '지금', at };
  const days = Math.floor(remaining / 1440);
  const hoursLeft = Math.floor((remaining % 1440) / 60);
  const minutesLeft = remaining % 60;
  const span = days > 0
    ? `${days}일 ${hoursLeft}시간`
    : hoursLeft > 0
      ? minutesLeft > 0 ? `${hoursLeft}시간 ${minutesLeft}분` : `${hoursLeft}시간`
      : `${minutesLeft}분`;
  return { remaining: `${span} 후`, at };
}

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
