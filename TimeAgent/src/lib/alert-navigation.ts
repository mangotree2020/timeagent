export type AlertAction = 'start-progress' | 'review-plan' | 'fix-location-permission';

export type AlertActionTarget =
  | { pathname: '/progress' }
  | { pathname: '/plan' }
  | { pathname: '/permissions'; params: { focus: 'location' } };

export function getAlertActionTarget(action: AlertAction): AlertActionTarget {
  if (action === 'start-progress') return { pathname: '/progress' };
  if (action === 'review-plan') return { pathname: '/plan' };
  return { pathname: '/permissions', params: { focus: 'location' } };
}
