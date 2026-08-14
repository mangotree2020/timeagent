import {
  advanceProgressSession,
  ProgressNotificationKind,
  ProgressSession,
  updateProgressWithDelay,
} from './progress-session';

export type ProgressNotificationRequest = {
  key: string;
  kind: ProgressNotificationKind;
  stepId: string | null;
  fireAt: number;
  title: string;
  body: string;
  /** Set when the alarm itself can be answered, so the user never has to open the app. */
  actionCategory: string | null;
};

const MINIMUM_FUTURE_DELAY_MS = 1_000;

const HANGUL_START = 0xAC00;
const HANGUL_END = 0xD7A3;
const JONGSEONG_COUNT = 28;
const RIEUL_JONGSEONG = 8;

/**
 * Korean writes `로` after a vowel or ㄹ and `으로` otherwise, so a fixed suffix reads wrong for
 * half the step names. This picks the one that matches the word it follows.
 */
export function withDirectionParticle(word: string) {
  const trimmed = word.trim();
  if (!trimmed) return '';
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < HANGUL_START || code > HANGUL_END) return `${trimmed}로`;
  const jongseong = (code - HANGUL_START) % JONGSEONG_COUNT;
  return `${trimmed}${jongseong === 0 || jongseong === RIEUL_JONGSEONG ? '로' : '으로'}`;
}

export const PROGRESS_STEP_ACTION_CATEGORY = 'on-time-progress-step';
export const PROGRESS_ADVANCE_ACTION = 'progress-advance';
export const PROGRESS_EXTEND_ACTION = 'progress-extend';
export const PROGRESS_EXTEND_MINUTES = 5;

export const PROGRESS_STEP_ACTIONS = [
  { identifier: PROGRESS_ADVANCE_ACTION, title: '다음 행동 시작' },
  { identifier: PROGRESS_EXTEND_ACTION, title: `${PROGRESS_EXTEND_MINUTES}분 더 하기` },
] as const;

export type ProgressNotificationActionResult =
  | { applied: true; session: ProgressSession; action: string }
  | { applied: false; reason: 'unknown-action' | 'stale-step' | 'completed' };

/**
 * Answers a step alarm without opening the app. A choice for a step the user already left is
 * dropped, so a late tap on an old alarm cannot skip the step they are actually on.
 */
export function applyProgressNotificationAction(
  session: ProgressSession,
  actionIdentifier: string,
  stepId: string | null,
  now = Date.now(),
): ProgressNotificationActionResult {
  if (actionIdentifier !== PROGRESS_ADVANCE_ACTION && actionIdentifier !== PROGRESS_EXTEND_ACTION) {
    return { applied: false, reason: 'unknown-action' };
  }
  if (session.state === 'completed' || !session.currentStepId) return { applied: false, reason: 'completed' };
  if (stepId && stepId !== session.currentStepId) return { applied: false, reason: 'stale-step' };

  const session_ = actionIdentifier === PROGRESS_ADVANCE_ACTION
    ? advanceProgressSession(session, now)
    : updateProgressWithDelay(session, PROGRESS_EXTEND_MINUTES, now);
  return { applied: true, session: session_, action: actionIdentifier };
}

/** What the coach says when a step becomes the current one. */
export function buildStepCoachMessage(
  step: { title: string; duration: number },
  next: { title: string } | null,
) {
  const opening = `이제 ${step.title} 시작할 시간이에요.`;
  const length = step.duration > 0 ? ` ${step.duration}분 잡아 두었어요.` : '';
  const following = next ? ` 끝나면 ${withDirectionParticle(next.title)} 넘어갈게요.` : ' 이게 마지막 준비예요.';
  return `${opening}${length}${following}`;
}

export function buildProgressNotificationRequests(
  session: ProgressSession,
  now = Date.now(),
  { stepCoaching = true } = {},
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
      actionCategory: null,
    });
  }

  let cursor = session.stepStartedAt + session.stepDurationSeconds * 1_000;
  for (let index = currentIndex; index < session.timeline.length; index += 1) {
    const step = session.timeline[index];
    const startAt = index === currentIndex ? session.stepStartedAt : cursor;
    const durationSeconds = index === currentIndex ? session.stepDurationSeconds : step.duration * 60;
    const endAt = startAt + durationSeconds * 1_000;

    // The running step and the departure already have their own cue, so a start alarm here would
    // repeat one the user just heard.
    if (stepCoaching && index > currentIndex && step.id !== 'depart' && step.duration > 0 && startAt > now) {
      requests.push({
        key: `step-start:${step.id}`,
        kind: 'step-start',
        stepId: step.id,
        fireAt: startAt,
        title: `${step.title} 시작할 시간이에요`,
        body: buildStepCoachMessage(step, session.timeline[index + 1] ?? null),
        actionCategory: null,
      });
    }

    if (step.id === 'depart' && startAt > now) {
      requests.push({
        key: `departure:${step.id}`,
        kind: 'departure',
        stepId: step.id,
        fireAt: startAt,
        title: '이제 출발할 시간이에요',
        body: `${withDirectionParticle(session.route)} ${session.schedule.destination}까지 이동을 시작해 주세요.`,
        actionCategory: null,
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
        title: `15분 뒤 ${withDirectionParticle(next.title)} 전환해요`,
        body: `지금 하는 ${step.title}을 천천히 마무리할 시점이에요.`,
        actionCategory: null,
      });
    }

    const wrapAt = endAt - 5 * 60_000;
    if (next && step.duration >= 10 && wrapAt > now) {
      requests.push({
        key: `transition-wrap:${step.id}`,
        kind: 'transition-wrap',
        stepId: step.id,
        fireAt: wrapAt,
        title: `5분 뒤 ${withDirectionParticle(next.title)} 이동해요`,
        body: `새 일을 벌이지 말고 현재 행동을 정리하세요. 다음 행동은 ${next.title}입니다.`,
        actionCategory: null,
      });
    }

    if (step.duration > 0 && endAt > now) {
      requests.push({
        key: `step-end:${step.id}`,
        kind: 'step-end',
        stepId: step.id,
        fireAt: endAt,
        title: `${step.title} 예정 시간이 끝났어요`,
        body: next
          ? `알림에서 바로 다음 행동 ${withDirectionParticle(next.title)} 넘어가거나 ${PROGRESS_EXTEND_MINUTES}분 더 할 수 있어요.`
          : `알림에서 바로 완료하거나 ${PROGRESS_EXTEND_MINUTES}분 더 할 수 있어요.`,
        actionCategory: PROGRESS_STEP_ACTION_CATEGORY,
      });
    }
    cursor = endAt;
  }

  return requests.sort((left, right) => left.fireAt - right.fireAt);
}
