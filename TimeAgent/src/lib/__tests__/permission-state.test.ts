import { normalizePermissionState, permissionStatusLabel } from '../permission-state';

describe('device permission state', () => {
  test('normalizes granted and not-yet-requested permissions', () => {
    expect(normalizePermissionState({ status: 'granted', granted: true, canAskAgain: true })).toBe('granted');
    expect(normalizePermissionState({ status: 'undetermined', granted: false, canAskAgain: true })).toBe('undetermined');
  });

  test('distinguishes a retryable denial from a blocked permission', () => {
    expect(normalizePermissionState({ status: 'denied', granted: false, canAskAgain: true })).toBe('denied');
    expect(normalizePermissionState({ status: 'denied', granted: false, canAskAgain: false })).toBe('blocked');
  });

  test('provides text labels so status is not expressed by color alone', () => {
    expect(permissionStatusLabel('undetermined')).toBe('요청 전');
    expect(permissionStatusLabel('granted')).toBe('허용됨');
    expect(permissionStatusLabel('denied')).toBe('거부됨 · 다시 요청 가능');
    expect(permissionStatusLabel('blocked')).toBe('기기 설정에서 허용 필요');
    expect(permissionStatusLabel('error')).toBe('상태 확인 실패');
  });
});
