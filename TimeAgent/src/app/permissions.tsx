import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, appType, useAppType } from '@/components/app-ui';
import { AppIcon, AppIconName, IconButton } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';
import { AppSettings, createDefaultAppSettings, loadAppSettings, saveAppSettings } from '@/lib/app-settings';
import {
  getDevicePermissionSnapshot,
  requestLocationPermission,
  requestNotificationPermission,
} from '@/lib/device-permissions';
import {
  AlarmReliabilitySnapshot,
  batteryOptimizationStatusLabel,
  exactAlarmStatusLabel,
  getAlarmReliabilitySnapshot,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  UNSUPPORTED_ALARM_RELIABILITY,
} from '@/lib/alarm-reliability';
import { withObjectParticle } from '@/lib/local-notifications';
import { PermissionState, permissionStatusLabel } from '@/lib/permission-state';

type PermissionKind = 'location' | 'notifications' | 'alarms';

export default function PermissionsScreen() {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  const params = useLocalSearchParams<{ focus?: PermissionKind }>();
  const [locationState, setLocationState] = useState<PermissionState>('loading');
  const [notificationState, setNotificationState] = useState<PermissionState>('loading');
  const [requesting, setRequesting] = useState<PermissionKind | null>(null);
  const [settings, setSettings] = useState(createDefaultAppSettings);
  const settingsRef = useRef(settings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [manualLocation, setManualLocation] = useState(settings.defaultLocation);
  const [message, setMessage] = useState('');
  const [alarmReliability, setAlarmReliability] = useState<AlarmReliabilitySnapshot>(UNSUPPORTED_ALARM_RELIABILITY);
  // Both alarm switches live on system screens, so the answer is read again each time the app comes
  // back from one — and once on open, so the card never shows a stale promise.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const refresh = () => setAlarmReliability(getAlarmReliabilitySnapshot());
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);

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
    setMessage(`${withObjectParticle(value)} 수동 출발지로 저장했습니다.`);
  };

  return (
    <Screen>
      <Header
        title="권한 설정"
        eyebrow={params.focus === 'notifications' ? '준비·출발 알림 설정' : params.focus === 'location' ? '출발 위치 설정' : params.focus === 'alarms' ? '준비 알람 정확도 설정' : '필요한 기능만 선택하세요'}
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
              setMessage(notifications ? 'TimeAgent 앱 알림을 켰습니다.' : '운영체제 권한은 유지하고 TimeAgent 앱 알림만 껐습니다.');
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

      {Platform.OS === 'android' ? (
        <Card style={[styles.permissionCard, params.focus === 'alarms' && styles.emphasized]}>
          <View style={styles.permissionHeader}>
            <View style={styles.icon}><AppIcon name="time" size={21} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.heading}>준비 알람 정확도</Text>
              <Text style={type.bodyMuted}>앱을 닫아둔 동안에도 준비 단계가 끝나는 순간에 알람이 울리려면 Android가 정확한 시각 알람을 허용하고 앱을 절전으로 멈추지 않아야 해요. 두 설정 모두 기기 설정 화면에서 직접 켜고 끌 수 있으며, 위치나 일정 정보는 쓰지 않아요.</Text>
            </View>
          </View>
          <View style={styles.reliabilityRow}>
            <StatusPill label={exactAlarmStatusLabel(alarmReliability.exactAlarms)} tone={alarmReliability.exactAlarms === 'needs-permission' ? 'warning' : alarmReliability.exactAlarms === 'allowed' ? 'success' : 'info'} />
            {alarmReliability.exactAlarms === 'needs-permission' ? (
              <Button label="정확한 시각 알람 허용" onPress={() => { if (!openExactAlarmSettings()) setMessage('이 기기에서는 알람 설정 화면을 열 수 없어요. 설정 앱의 알람 및 리마인더에서 TimeAgent를 허용해 주세요.'); }} />
            ) : null}
          </View>
          <View style={styles.reliabilityRow}>
            <StatusPill label={batteryOptimizationStatusLabel(alarmReliability.batteryOptimization)} tone={alarmReliability.batteryOptimization === 'optimizing' ? 'warning' : alarmReliability.batteryOptimization === 'exempt' ? 'success' : 'info'} />
            {alarmReliability.batteryOptimization === 'optimizing' ? (
              <Button label="배터리 최적화 예외 설정" variant="secondary" onPress={() => { if (!openBatteryOptimizationSettings()) setMessage('이 기기에서는 배터리 설정 화면을 열 수 없어요. 설정 앱의 배터리에서 TimeAgent를 최적화 예외로 지정해 주세요.'); }} />
            ) : null}
          </View>
          <Text style={type.caption}>설정 없이도 앱을 열어 두면 알람과 남은 시간이 그대로 안내돼요.</Text>
        </Card>
      ) : null}

      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
      <Button label="돌아가기" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
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
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
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

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  intro: { gap: space.sm },
  introTitle: { color: c.onInverse, fontSize: 19, lineHeight: 26, fontWeight: '900' },
  introBody: { color: c.onInverseMuted, fontSize: 15, lineHeight: 23 },
  permissionCard: { gap: space.md },
  emphasized: { borderWidth: 2, borderColor: c.cyan },
  permissionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  reliabilityRow: { gap: space.sm },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  fallback: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceMuted },
  fallbackTitle: { color: c.navy, fontSize: 14, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: space.md, color: c.text, fontSize: 16 },
  message: { ...type.bodyMuted, textAlign: 'center', color: c.deepBlue, fontWeight: '700' },
  });
};
