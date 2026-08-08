import { StyleSheet, Text, View } from 'react-native';

import { type } from '@/components/app-ui';
import { color, radius, space } from '@/constants/design';
import { Coordinate } from '@/lib/journey';

export type DestinationMapProps = {
  coordinate: Coordinate;
  onSelect: (coordinate: Coordinate) => void;
};

export function DestinationMap({ coordinate }: DestinationMapProps) {
  return <View accessibilityLabel="지도 위치 지정 대체 화면" style={styles.fallback}>
    <Text style={type.body}>지도에서 직접 지정은 Android 또는 iOS 앱에서 사용할 수 있어요.</Text>
    <Text style={type.bodyMuted}>현재 선택: {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  fallback: { minHeight: 160, justifyContent: 'center', gap: space.sm, padding: space.lg, backgroundColor: color.surfaceMuted, borderRadius: radius.md },
});
