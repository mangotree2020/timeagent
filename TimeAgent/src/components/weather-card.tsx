import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, AppIconName } from '@/components/app-icon';
import { Card } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { loadCurrentDeviceWeather, WeatherPermissionNeededError } from '@/lib/device-weather-provider';
import {
  createWeatherPreviewFixture,
  roundTemperature,
  WeatherSnapshot,
  weatherPreparationAdvice,
} from '@/lib/weather';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';

type WeatherStatus = 'checking' | 'ready' | 'permission-needed' | 'error';

/**
 * Today's weather with one line of preparation advice, kept fresh while the app is open. It lives
 * on the alerts screen — weather is a message about the day, not part of the appointment itself —
 * and opens the weather detail when tapped.
 */
export function WeatherCard() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const params = useLocalSearchParams<{ e2eWeather?: string }>();
  const fixtureMode = __DEV__ && params.e2eWeather === 'ready';
  const errorFixtureMode = __DEV__ && params.e2eWeather === 'error';
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => fixtureMode ? createWeatherPreviewFixture() : null);
  const [status, setStatus] = useState<WeatherStatus>(fixtureMode ? 'ready' : errorFixtureMode ? 'error' : 'checking');

  const loadWeather = useCallback(async () => {
    if (fixtureMode) {
      setWeather(createWeatherPreviewFixture());
      setStatus('ready');
      return;
    }
    if (errorFixtureMode) {
      setWeather(null);
      setStatus('error');
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
  }, [errorFixtureMode, fixtureMode]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadWeather(), 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadWeather();
    });
    return () => {
      clearTimeout(initialLoad);
      subscription.remove();
    };
  }, [loadWeather]);

  if (status === 'checking') {
    return <Card style={styles.weatherState}><ActivityIndicator color={c.deepBlue} /><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>현재 날씨 확인 중</Text><Text style={styles.weatherStateBody}>승인된 현재 위치로 날씨를 불러오고 있어요.</Text></View></Card>;
  }

  if (status === 'permission-needed') {
    return <Card style={styles.weatherState}><View style={styles.weatherIcon}><AppIcon name="location" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>현재 위치 날씨를 확인하세요</Text><Text style={styles.weatherStateBody}>위치 권한을 허용하면 일정 준비에 필요한 날씨를 보여드려요.</Text><Pressable accessibilityRole="button" accessibilityLabel="위치 권한 설정" onPress={() => router.push({ pathname: '/permissions', params: { focus: 'location' } })} style={styles.weatherLink}><Text style={styles.weatherLinkText}>위치 권한 설정</Text><AppIcon name="chevronRight" size={16} /></Pressable></View></Card>;
  }

  if (status === 'error' || !weather) {
    return <Card style={styles.weatherState}><View style={styles.weatherIcon}><AppIcon name="error" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>날씨를 불러오지 못했어요</Text><Text style={styles.weatherStateBody}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text><Pressable accessibilityRole="button" accessibilityLabel="날씨 다시 불러오기" onPress={() => void loadWeather()} style={styles.weatherLink}><Text style={styles.weatherLinkText}>다시 불러오기</Text><AppIcon name="chevronRight" size={16} /></Pressable></View></Card>;
  }

  const locationName = weather.locationName || '주변 날씨';
  const accessibilityLabel = `${locationName} 날씨 ${weather.condition}, ${roundTemperature(weather.temperatureC)}도. 날씨 상세 보기`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="날씨 상세 화면으로 이동합니다"
      onPress={() => router.push(fixtureMode ? { pathname: '/weather', params: { e2eWeather: 'ready' } } : '/weather')}
      style={({ pressed }) => [styles.weatherPressable, pressed && styles.pressed]}
    >
      <Card style={styles.weatherCard}>
        <View style={styles.weatherIcon}><AppIcon name={weatherIconName(weather)} size={24} /></View>
        <View style={styles.weatherCopy}>
          <Text style={styles.weatherCondition}>{locationName} · {weather.condition} {roundTemperature(weather.temperatureC)}°</Text>
          <Text numberOfLines={2} style={styles.weatherAdvice}>{weatherPreparationAdvice(weather)}</Text>
        </View>
        <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
      </Card>
    </Pressable>
  );
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
  weatherPressable: { minHeight: 44, borderRadius: radius.lg },
  pressed: { opacity: 0.85 },
  weatherCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  weatherIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice, flexShrink: 0 },
  weatherCopy: { flex: 1, gap: 2 },
  weatherCondition: { color: c.navy, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  weatherAdvice: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  weatherState: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  weatherStateCopy: { flex: 1, gap: 3 },
  weatherStateTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  weatherStateBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  weatherLink: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  weatherLinkText: { color: c.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
});
