export type AlertAction =
  | 'start-progress'
  | 'review-plan'
  | 'fix-location-permission'
  | 'fix-notification-permission';

export type AlertActionTarget =
  | { pathname: '/progress' }
  | { pathname: '/plan' }
  | { pathname: '/permissions'; params: { focus: 'location' | 'notifications' } };

export function getAlertActionTarget(action: AlertAction): AlertActionTarget {
  if (action === 'start-progress') return { pathname: '/progress' };
  if (action === 'review-plan') return { pathname: '/plan' };
  if (action === 'fix-notification-permission') return { pathname: '/permissions', params: { focus: 'notifications' } };
  return { pathname: '/permissions', params: { focus: 'location' } };
}
