export type AlertAction =
  | 'start-progress'
  | 'review-plan'
  | 'review-past-schedules'
  | 'fix-location-permission'
  | 'fix-notification-permission';

export type AlertActionTarget =
  | { pathname: '/progress' }
  | { pathname: '/plan' }
  | { pathname: '/schedules'; params: { tab: 'past' } }
  | { pathname: '/permissions'; params: { focus: 'location' | 'notifications' } };

export function getAlertActionTarget(action: AlertAction): AlertActionTarget {
  if (action === 'start-progress') return { pathname: '/progress' };
  if (action === 'review-plan') return { pathname: '/plan' };
  // Finished appointments live on the past tab; the plan screen only knows the current one.
  if (action === 'review-past-schedules') return { pathname: '/schedules', params: { tab: 'past' } };
  if (action === 'fix-notification-permission') return { pathname: '/permissions', params: { focus: 'notifications' } };
  return { pathname: '/permissions', params: { focus: 'location' } };
}
