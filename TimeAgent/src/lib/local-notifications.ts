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

    const next = session.timeline[index + 1];
    const previewAt = endAt - 15 * 60_000;
    if (next && step.duration >= 20 && previewAt > now) {
      requests.push({
        key: `transition-preview:${step.id}`,
        kind: 'transition-preview',
        stepId: step.id,
        fireAt: previewAt,
        title: `15분 뒤 ${next.title}(으)로 전환해요`,
        body: `지금 하는 ${step.title}을 천천히 마무리할 시점이에요.`,
      });
    }

    const wrapAt = endAt - 5 * 60_000;
    if (next && step.duration >= 10 && wrapAt > now) {
      requests.push({
        key: `transition-wrap:${step.id}`,
        kind: 'transition-wrap',
        stepId: step.id,
        fireAt: wrapAt,
        title: `5분 뒤 ${next.title}(으)로 이동해요`,
        body: `새 일을 벌이지 말고 현재 행동을 정리하세요. 다음 행동은 ${next.title}입니다.`,
      });
    }

    if (step.duration > 0 && endAt > now) {
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
