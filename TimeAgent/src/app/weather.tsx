import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, useAppType } from '@/components/app-ui';
import { AppIcon, AppIconName, IconButton } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { loadCurrentDeviceWeather, WeatherPermissionNeededError } from '@/lib/device-weather-provider';
import {
  createWeatherPreviewFixture,
  roundTemperature,
  WeatherSnapshot,
  weatherPreparationAdvice,
} from '@/lib/weather';

type WeatherDetailStatus = 'checking' | 'ready' | 'permission-needed' | 'error';

export default function WeatherScreen() {
  const params = useLocalSearchParams<{ e2eWeather?: string }>();
  const fixtureMode = __DEV__ && params.e2eWeather === 'ready';
  const [status, setStatus] = useState<WeatherDetailStatus>(fixtureMode ? 'ready' : 'checking');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(fixtureMode ? createWeatherPreviewFixture() : null);

  const loadWeather = useCallback(async () => {
    if (fixtureMode) {
      setWeather(createWeatherPreviewFixture());
      setStatus('ready');
      return;
    }
    setStatus('checking');
    try {
      setWeather(await loadCurrentDeviceWeather());
      setStatus('ready');
    } catch (error) {
      setWeather(null);
      setStatus(error instanceof WeatherPermissionNeededError ? 'permission-needed' : 'error');
    }
  }, [fixtureMode]);

  useEffect(() => {
    if (fixtureMode) return;
    const initialLoad = setTimeout(() => void loadWeather(), 0);
    return () => clearTimeout(initialLoad);
  }, [fixtureMode, loadWeather]);

  return (
    <Screen>
      <Header
        eyebrow={weather?.locationName ? `${weather.locationName} 기준` : '위치 기반'}
        title="날씨 상세"
        right={<IconButton name="close" label="날씨 상세 닫기" variant="plain" onPress={() => router.back()} />}
      />
      <WeatherDetail status={status} weather={weather} onRetry={() => void loadWeather()} />
    </Screen>
  );
}

function WeatherDetail({ status, weather, onRetry }: { status: WeatherDetailStatus; weather: WeatherSnapshot | null; onRetry: () => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  if (status === 'checking') {
    return <Card style={styles.state}><ActivityIndicator color={c.deepBlue} /><Text style={type.heading}>현재 위치 날씨를 확인하고 있어요</Text><Text style={type.bodyMuted}>잠시만 기다려 주세요.</Text></Card>;
  }
  if (status === 'permission-needed') {
    return <Card style={styles.state}><View style={styles.stateIcon}><AppIcon name="location" size={25} /></View><Text style={type.heading}>위치 권한이 필요해요</Text><Text style={type.bodyMuted}>현재 좌표를 기준으로 가까운 날씨를 확인합니다.</Text><Button label="위치 권한 설정" onPress={() => router.push({ pathname: '/permissions', params: { focus: 'location' } })} /></Card>;
  }
  if (status === 'error' || !weather) {
    return <Card style={styles.state}><View style={styles.stateIcon}><AppIcon name="error" size={25} /></View><Text style={type.heading}>날씨를 불러오지 못했어요</Text><Text style={type.bodyMuted}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text><Button label="다시 불러오기" onPress={onRetry} /></Card>;
  }

  const provider = weather.source === 'kma' ? '기상청' : 'Open-Meteo';
  const providerUrl = weather.source === 'kma' ? 'https://www.weather.go.kr/' : 'https://open-meteo.com/';
  return (
    <>
      <Card style={styles.currentCard}>
        <View style={styles.currentTop}>
          <View style={styles.weatherIcon}><AppIcon name={weatherIconName(weather)} size={34} /></View>
          <View style={styles.currentCopy}>
            <Text style={styles.condition}>{weather.condition}</Text>
            <Text style={styles.freshness}>{weather.stale ? '최근 저장된 날씨' : '방금 확인한 날씨'}</Text>
          </View>
          <Text style={styles.temperature}>{roundTemperature(weather.temperatureC)}°</Text>
        </View>
        <Text style={styles.advice}>{weatherPreparationAdvice(weather)}</Text>
      </Card>

      <View style={styles.metricRow}>
        <Metric label="체감" value={`${roundTemperature(weather.apparentTemperatureC)}°`} />
        <Metric label="최고" value={`${roundTemperature(weather.maximumTemperatureC)}°`} />
        <Metric label="최저" value={`${roundTemperature(weather.minimumTemperatureC)}°`} />
      </View>

      <Card style={styles.rainCard}>
        <View style={styles.rainIcon}><AppIcon name="weatherRain" size={22} /></View>
        <View style={styles.rainCopy}>
          <Text style={styles.rainLabel}>오늘 강수 확률</Text>
          <Text style={styles.rainValue}>{Math.round(weather.precipitationProbability)}%</Text>
        </View>
      </Card>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`날씨 데이터 제공 ${provider}`}
        onPress={() => void Linking.openURL(providerUrl)}
        style={({ pressed }) => [styles.source, pressed && styles.pressed]}
      >
        <Text style={styles.sourceText}>날씨 데이터: {provider}</Text>
        <AppIcon name="chevronRight" size={15} iconColor={c.textMuted} />
      </Pressable>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function weatherIconName(weather: WeatherSnapshot): AppIconName {
  if (weather.icon === 'clear') return 'weatherClear';
  if (weather.icon === 'fog') return 'weatherFog';
  if (weather.icon === 'rain') return 'weatherRain';
  if (weather.icon === 'snow') return 'weatherSnow';
  if (weather.icon === 'storm') return 'weatherStorm';
  return 'weatherCloudy';
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: space.md },
  stateIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice },
  currentCard: { gap: space.lg, borderColor: 'transparent' },
  currentTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  weatherIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice },
  currentCopy: { flex: 1, gap: 2 },
  condition: { color: c.navy, fontSize: 20, lineHeight: 27, fontWeight: '900' },
  freshness: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  temperature: { color: c.deepBlue, fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.5 },
  advice: { padding: space.lg, overflow: 'hidden', borderRadius: radius.md, backgroundColor: c.primarySoft, color: c.navy, fontSize: 16, lineHeight: 23, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: space.sm },
  metric: { flex: 1, minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.lg, backgroundColor: c.surface },
  metricLabel: { color: c.textMuted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  metricValue: { color: c.navy, fontSize: 22, lineHeight: 29, fontWeight: '900' },
  rainCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderColor: 'transparent' },
  rainIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice },
  rainCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rainLabel: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  rainValue: { color: c.deepBlue, fontSize: 20, lineHeight: 27, fontWeight: '900' },
  source: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: space.md },
  sourceText: { color: c.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', textDecorationLine: 'underline' },
  pressed: { opacity: 0.65 },
});
