import { ProgressNotificationKind, ProgressSession } from './progress-session';

export type ProgressNotificationRequest = {
  key: string;
  kind: ProgressNotificationKind;
  stepId: string | null;
  fireAt: number;
  title: string;
  body: string;
};

const MINIMUM_FUTURE_DELAY_MS = 1_000;

export function buildProgressNotificationRequests(
  session: ProgressSession,
  now = Date.now(),
): ProgressNotificationRequest[] {
  if (session.state === 'completed' || !session.currentStepId) return [];
  const currentIndex = session.timeline.findIndex((step) => step.id === session.currentStepId);
  if (currentIndex < 0) return [];

  const requests: ProgressNotificationRequest[] = [];
  if (currentIndex === 0 && Math.abs(now - session.stepStartedAt) < 2_000) {
    requests.push({
      key: `prep-start:${session.currentStepId}`,
      kind: 'prep-start',
      stepId: session.currentStepId,
      fireAt: now + MINIMUM_FUTURE_DELAY_MS,
      title: '준비를 시작할 시간이에요',
      body: `지금 ${session.timeline[currentIndex].title}부터 시작하면 돼요.`,
    });
  }

  let cursor = session.stepStartedAt + session.stepDurationSeconds * 1_000;
  for (let index = currentIndex; index < session.timeline.length; index += 1) {
    const step = session.timeline[index];
    const startAt = index === currentIndex ? session.stepStartedAt : cursor;
    const durationSeconds = index === currentIndex ? session.stepDurationSeconds : step.duration * 60;
    const endAt = startAt + durationSeconds * 1_000;

    if (step.id === 'depart' && startAt > now) {
      requests.push({
        key: `departure:${step.id}`,
        kind: 'departure',
        stepId: step.id,
        fireAt: startAt,
        title: '이제 출발할 시간이에요',
        body: `${session.route}(으)로 ${session.schedule.destination}까지 이동을 시작해 주세요.`,
      });
    }

    if (step.duration > 0 && endAt > now) {
      const next = session.timeline[index + 1];
      requests.push({
        key: `step-end:${step.id}`,
        kind: 'step-end',
        stepId: step.id,
        fireAt: endAt,
        title: `${step.title} 예정 시간이 끝났어요`,
        body: next ? `완료했는지 확인하고 다음은 ${next.title}입니다.` : '완료했는지 확인해 주세요.',
      });
    }
    cursor = endAt;
  }

  return requests.sort((left, right) => left.fireAt - right.fireAt);
}
