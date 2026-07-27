export type PermissionState = 'loading' | 'undetermined' | 'granted' | 'denied' | 'blocked' | 'error';

type PermissionResponseLike = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
};

export function normalizePermissionState(response: PermissionResponseLike): Exclude<PermissionState, 'loading' | 'error'> {
  if (response.granted || response.status === 'granted') return 'granted';
  if (response.status === 'undetermined') return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

export function permissionStatusLabel(state: PermissionState) {
  if (state === 'loading') return '확인 중';
  if (state === 'undetermined') return '요청 전';
  if (state === 'granted') return '허용됨';
  if (state === 'denied') return '거부됨 · 다시 요청 가능';
  if (state === 'blocked') return '기기 설정에서 허용 필요';
  return '상태 확인 실패';
}
