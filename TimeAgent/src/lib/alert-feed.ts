import { AlertAction } from './alert-navigation';
import { AppIconName } from '@/components/app-icon';
import { ConfirmedSchedulePlan } from './confirmed-plans';
import { preparationCountdown } from './home-attention';
import { ProgressNotificationStatus } from './notification-service';

export type AppAlert = {
  id: string;
  icon: AppIconName;
  title: string;
  body: string;
  /** Relative wording — an absolute timestamp would go stale while the screen is open. */
  time: string;
  tone: 'info' | 'success' | 'warning';
  action: AlertAction;
  actionLabel: string;
};

const DAY = 86_400_000;

/**
 * What the alert screen has to say right now, derived from the schedules that actually exist.
 * The list is deliberately short: this screen earns its place by being true, not by being full.
 */
export function buildAlertFeed({
  plans,
  sessionActive,
  notificationStatus,
  now = Date.now(),
}: {
  plans: ConfirmedSchedulePlan[];
  sessionActive: boolean;
  notificationStatus: ProgressNotificationStatus;
  now?: number;
}): AppAlert[] {
  const alerts: AppAlert[] = [];

  if (sessionActive) {
    alerts.push({
      id: 'progress-running',
      icon: 'time',
      title: '준비 진행 중',
      body: '남은 준비 행동과 출발 시각을 진행 화면에서 확인할 수 있어요.',
      time: '진행 중',
      tone: 'success',
      action: 'start-progress',
      actionLabel: '진행 화면 열기',
    });
  }

  const upcoming = plans
    .filter((plan) => plan.state === 'scheduled' && plan.appointmentAt >= now)
    .sort((first, second) => first.prepStartAt - second.prepStartAt);

  // Only the nearest one is an alert. The rest belong on the schedule list, not here.
  const next = upcoming[0];
  if (next) {
    const countdown = preparationCountdown(next.prepStartAt, now);
    alerts.push({
      id: `prep-${next.id}`,
      icon: 'coach',
      title: '준비 시작 알림',
      body: `${next.schedule.title} · ${next.plan.prepStart}에 준비를 시작해요.`,
      time: countdown.label,
      tone: countdown.tone,
      action: 'review-plan',
      actionLabel: '준비 계획 확인',
    });
  }

  const missed = plans.filter((plan) => plan.state === 'incomplete' && now - plan.appointmentAt < DAY);
  if (missed.length) {
    alerts.push({
      id: 'missed',
      icon: 'error',
      title: missed.length > 1 ? `완료하지 못한 약속 ${missed.length}건` : '완료하지 못한 약속',
      body: '준비 시간을 다시 살펴보면 다음 약속을 더 정확하게 계획할 수 있어요.',
      time: '지난 24시간',
      tone: 'warning',
      action: 'review-plan',
      actionLabel: '지난 계획 확인',
    });
  }

  // Without notification permission every scheduled reminder silently fails, so this outranks
  // the schedule alerts in urgency even though it is listed after them.
  if (notificationStatus === 'disabled' || notificationStatus === 'error') {
    alerts.push({
      id: 'notification-permission',
      icon: 'alert',
      title: notificationStatus === 'disabled' ? '알림 권한 꺼짐' : '알림 예약 실패',
      body: notificationStatus === 'disabled'
        ? '준비 시작과 출발 시각을 제때 알려드리려면 알림 권한이 필요해요.'
        : '준비 알림 예약에 실패했어요. 알림 설정을 확인해 주세요.',
      time: '확인 필요',
      tone: 'warning',
      action: 'fix-notification-permission',
      actionLabel: '알림 설정 열기',
    });
  }

  return alerts;
}
