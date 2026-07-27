export function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function shiftClock(clock: string, deltaMinutes: number) {
  const [hours, minutes] = clock.split(':').map(Number);
  const total = (hours * 60 + minutes + deltaMinutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function arrivalStatus(arrival: string, appointment: string) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const difference = toMinutes(appointment) - toMinutes(arrival);
  if (difference >= 0) return { tone: 'success' as const, minutes: difference, label: `${difference}분 여유` };
  return { tone: 'danger' as const, minutes: difference, label: `${Math.abs(difference)}분 지각 예상` };
}

