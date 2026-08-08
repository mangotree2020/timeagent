import { getAlertActionTarget } from '../alert-navigation';

describe('alert icon navigation', () => {
  test.each([
    ['start-progress', { pathname: '/progress' }],
    ['review-plan', { pathname: '/plan' }],
    ['fix-location-permission', { pathname: '/permissions', params: { focus: 'location' } }],
  ] as const)('routes %s to its actionable screen', (action, expected) => {
    expect(getAlertActionTarget(action)).toEqual(expected);
  });
});
