import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { AppIcon, AppIconName, IconButton } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';
import { AppSettings, createDefaultAppSettings, loadAppSettings, saveAppSettings } from '@/lib/app-settings';
import {
  getDevicePermissionSnapshot,
  requestLocationPermission,
  requestNotificationPermission,
} from '@/lib/device-permissions';
import { PermissionState, permissionStatusLabel } from '@/lib/permission-state';

type PermissionKind = 'location' | 'notifications';

export default function PermissionsScreen() {
  const params = useLocalSearchParams<{ focus?: PermissionKind }>();
  const [locationState, setLocationState] = useState<PermissionState>('loading');
  const [notificationState, setNotificationState] = useState<PermissionState>('loading');
  const [requesting, setRequesting] = useState<PermissionKind | null>(null);
  const [settings, setSettings] = useState(createDefaultAppSettings);
  const settingsRef = useRef(settings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [manualLocation, setManualLocation] = useState(settings.defaultLocation);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([loadAppSettings(AsyncStorage), getDevicePermissionSnapshot()])
      .then(([savedSettings, permissions]) => {
        if (!active) return;
        settingsRef.current = savedSettings;
        setSettings(savedSettings);
        setManualLocation(savedSettings.defaultLocation);
        setLocationState(permissions.location);
        setNotificationState(permissions.notifications);
      })
      .catch(() => {
        if (!active) return;
        setLocationState('error');
        setNotificationState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((values: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...values };
    settingsRef.current = next;
    setSettings(next);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveAppSettings(AsyncStorage, next));
    saveQueue.current.catch(() => setMessage('설정을 저장하지 못했습니다. 다시 시도해 주세요.'));
  }, []);

  const requestLocation = async () => {
    setRequesting('location');
    setMessage('');
    const next = await requestLocationPermission();
    setLocationState(next);
    setRequesting(null);
    setMessage(next === 'granted'
      ? '위치 권한을 허용했습니다. 출발 위치 계산에 사용할 수 있어요.'
      : '위치 권한 없이도 수동 출발지를 입력해 계속 사용할 수 있어요.');
  };

  const requestNotifications = async () => {
    setRequesting('notifications');
    setMessage('');
    const next = await requestNotificationPermission();
    setNotificationState(next);
    setRequesting(null);
    updateSettings({ notifications: next === 'granted' });
    setMessage(next === 'granted'
      ? '알림 권한을 허용했습니다. 준비와 출발 시점을 알려드릴게요.'
      : '알림 없이도 앱 안에서 현재 행동과 남은 시간을 확인할 수 있어요.');
  };

  const saveManualLocation = () => {
    const value = manualLocation.trim();
    if (!value) return;
    updateSettings({ defaultLocation: value });
    setMessage(`${value}을(를) 수동 출발지로 저장했습니다.`);
  };

  return (
    <Screen>
      <Header
        title="권한 설정"
        eyebrow={params.focus === 'notifications' ? '준비·출발 알림 설정' : params.focus === 'location' ? '출발 위치 설정' : '필요한 기능만 선택하세요'}
        right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />}
      />

      <Card dark style={styles.intro}>
        <Text style={styles.introTitle}>허용하기 전에 먼저 알려드릴게요</Text>
        <Text style={styles.introBody}>위치는 이동 시간 계산에만, 알림은 준비와 출발 시점을 알려드리는 데만 사용합니다. 거부해도 핵심 일정 기능은 계속 사용할 수 있어요.</Text>
      </Card>

      <PermissionCard
        icon="location"
        title="현재 위치"
        reason="출발 위치를 자동으로 채우고 NAVER 지도 경로의 시작점을 계산합니다."
        state={locationState}
        emphasized={params.focus === 'location'}>
        {locationState === 'undetermined' || locationState === 'denied' || locationState === 'error' ? (
          <Button label={requesting === 'location' ? '요청 중…' : locationState === 'denied' ? '위치 권한 다시 요청' : '위치 권한 요청'} onPress={() => void requestLocation()} disabled={requesting !== null} />
        ) : null}
        {locationState === 'blocked' ? <Button label="기기 설정에서 위치 허용" onPress={() => void Linking.openSettings()} /> : null}
        {locationState === 'denied' || locationState === 'blocked' || locationState === 'error' ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>대신 출발지를 직접 입력할 수 있어요</Text>
            <TextInput
              accessibilityLabel="수동 출발지"
              value={manualLocation}
              onChangeText={setManualLocation}
              placeholder="동네 또는 주소"
              style={styles.input}
            />
            <Button label="수동 출발지 저장" variant="secondary" onPress={saveManualLocation} disabled={!manualLocation.trim()} />
          </View>
        ) : null}
      </PermissionCard>

      <PermissionCard
        icon="alert"
        title="준비·출발 알림"
        reason="준비 시작, 단계 종료와 출발 시점을 놓치지 않도록 중요한 순간에만 알려드립니다."
        state={notificationState}
        emphasized={params.focus === 'notifications'}>
        {notificationState === 'undetermined' || notificationState === 'denied' || notificationState === 'error' ? (
          <Button label={requesting === 'notifications' ? '요청 중…' : notificationState === 'denied' ? '알림 권한 다시 요청' : '알림 권한 요청'} onPress={() => void requestNotifications()} disabled={requesting !== null} />
        ) : null}
        {notificationState === 'blocked' ? <Button label="기기 설정에서 알림 허용" onPress={() => void Linking.openSettings()} /> : null}
        {notificationState === 'granted' ? (
          <Button
            label={settings.notifications ? '앱 알림 끄기' : '앱 알림 켜기'}
            variant="secondary"
            onPress={() => {
              const notifications = !settings.notifications;
              updateSettings({ notifications });
              setMessage(notifications ? 'ON:TIME 앱 알림을 켰습니다.' : '운영체제 권한은 유지하고 ON:TIME 앱 알림만 껐습니다.');
            }}
          />
        ) : null}
        {notificationState === 'denied' || notificationState === 'blocked' || notificationState === 'error' ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>앱 내 안내로 계속할 수 있어요</Text>
            <Text style={type.caption}>앱을 열면 현재 행동, 남은 시간과 변경된 출발 시점을 같은 진행 화면에서 확인할 수 있습니다.</Text>
            <Button label="알림 없이 계속" variant="secondary" onPress={() => { updateSettings({ notifications: false }); setMessage('알림 없이 앱 내 진행 안내를 사용합니다.'); }} />
          </View>
        ) : null}
      </PermissionCard>

      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
      <Button label="설정으로 돌아가기" variant="ghost" onPress={() => router.replace('/settings')} />
    </Screen>
  );
}

function PermissionCard({
  icon,
  title,
  reason,
  state,
  emphasized,
  children,
}: {
  icon: AppIconName;
  title: string;
  reason: string;
  state: PermissionState;
  emphasized: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card style={[styles.permissionCard, emphasized && styles.emphasized]}>
      <View style={styles.permissionHeader}>
        <View style={styles.icon}><AppIcon name={icon} size={21} /></View>
        <View style={{ flex: 1 }}><Text style={type.heading}>{title}</Text><Text style={type.bodyMuted}>{reason}</Text></View>
      </View>
      <StatusPill label={permissionStatusLabel(state)} tone={permissionTone(state)} />
      {children}
    </Card>
  );
}

function permissionTone(state: PermissionState) {
  if (state === 'granted') return 'success' as const;
  if (state === 'denied' || state === 'blocked' || state === 'error') return 'warning' as const;
  return 'info' as const;
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  introTitle: { color: color.surface, fontSize: 19, lineHeight: 26, fontWeight: '900' },
  introBody: { color: color.ice, fontSize: 15, lineHeight: 23 },
  permissionCard: { gap: space.md },
  emphasized: { borderWidth: 2, borderColor: color.cyan },
  permissionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted },
  fallback: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceMuted },
  fallbackTitle: { color: color.navy, fontSize: 14, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, paddingHorizontal: space.md, color: color.text, fontSize: 16 },
  message: { ...type.bodyMuted, textAlign: 'center', color: color.deepBlue, fontWeight: '700' },
});
