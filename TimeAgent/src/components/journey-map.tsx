import { StyleSheet, Text, View } from 'react-native';

import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';
import { JourneyLocation, RoutePlan } from '@/lib/journey';

export type JourneyMapProps = {
  route: RoutePlan;
  location: JourneyLocation;
  destinationName: string;
};

export function JourneyMap({ route, location, destinationName }: JourneyMapProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLabel="지도 텍스트 대체 화면" style={styles.fallback}>
      <Text style={styles.title}>지도 대신 경로 정보를 표시합니다</Text>
      <Text style={styles.body}>현재 위치 {location.coordinate.latitude.toFixed(4)}, {location.coordinate.longitude.toFixed(4)}</Text>
      <Text style={styles.body}>목적지 {destinationName}</Text>
      <Text style={styles.body}>남은 경로 {route.distanceMeters}m · 약 {Math.ceil(route.durationSeconds / 60)}분</Text>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  fallback: { minHeight: 300, justifyContent: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.lg, backgroundColor: c.ice, borderWidth: 1, borderColor: c.cyan },
  title: { color: c.navy, fontSize: 18, lineHeight: 25, fontWeight: '900' },
  body: { color: c.text, fontSize: 16, lineHeight: 24 },
});

