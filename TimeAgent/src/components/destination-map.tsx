import { StyleSheet, Text, View } from 'react-native';

import { useAppType } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';
import { Coordinate, describeRoutePlan, RoutePlan } from '@/lib/journey';

export type DestinationMapProps = {
  coordinate: Coordinate;
  onSelect?: (coordinate: Coordinate) => void;
  route?: RoutePlan | null;
};

export function DestinationMap({ coordinate, route }: DestinationMapProps) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  const summary = route ? describeRoutePlan(route) : null;
  return <View accessibilityLabel="지도 위치 지정 대체 화면" style={styles.fallback}>
    <Text style={type.body}>지도에서 직접 지정은 Android 또는 iOS 앱에서 사용할 수 있어요.</Text>
    <Text style={type.bodyMuted}>현재 선택: {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text>
    {summary ? <Text accessibilityLabel={`이동 경로 ${summary.sourceText}, 거리 ${summary.distanceText}, 예상 시간 ${summary.durationText}`} style={type.bodyMuted}>
      이동 경로 · {summary.sourceText} · {summary.distanceText} · {summary.durationText}
    </Text> : null}
  </View>;
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  fallback: { minHeight: 160, justifyContent: 'center', gap: space.sm, padding: space.lg, backgroundColor: c.surfaceMuted, borderRadius: radius.md },
});
