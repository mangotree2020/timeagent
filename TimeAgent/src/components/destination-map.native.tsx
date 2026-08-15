import { NaverMapMarkerOverlay, NaverMapPathOverlay, NaverMapView } from '@mj-studio/react-native-naver-map';
import { StyleSheet, Text, View } from 'react-native';

import { useAppType } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { DestinationMapProps } from '@/components/destination-map';
import { describeRoutePlan, mapRegionForPath } from '@/lib/journey';

export function DestinationMap({ coordinate, onSelect, route, fill = false }: DestinationMapProps) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const summary = route ? describeRoutePlan(route) : null;
  const region = route ? mapRegionForPath(route.path) : null;
  return <View accessibilityLabel={route ? '출발지에서 목적지까지 이동 경로 지도' : '목적지를 직접 지정하는 지도'} style={[styles.container, fill && styles.fill]}>
    <NaverMapView
      style={styles.map}
      mapType="Basic"
      {...(region ? { region } : { initialCamera: { ...coordinate, zoom: 16 } })}
      isShowLocationButton={!!onSelect}
      isShowZoomControls
      onTapMap={onSelect ? ({ latitude, longitude }) => onSelect({ latitude, longitude }) : undefined}
    >
      {route ? <NaverMapPathOverlay
        coords={route.path}
        width={8}
        outlineWidth={3}
        color={c.navy}
        outlineColor="white"
        progress={0}
      /> : null}
      {route ? <NaverMapMarkerOverlay
        latitude={route.origin.latitude}
        longitude={route.origin.longitude}
        caption={{ text: '출발', color: c.navy, haloColor: 'white', textSize: 13 }}
      /> : null}
      <NaverMapMarkerOverlay
        latitude={coordinate.latitude}
        longitude={coordinate.longitude}
        caption={{ text: route ? '도착' : '선택한 목적지', color: c.navy, haloColor: 'white', textSize: 13 }}
      />
    </NaverMapView>
    {summary ? <Text
      accessibilityLabel={`이동 경로 ${summary.sourceText}, 거리 ${summary.distanceText}, 예상 시간 ${summary.durationText}`}
      style={[type.bodyMuted, styles.summary]}>
      이동 경로 · {summary.sourceText} · {summary.distanceText} · {summary.durationText}
    </Text> : null}
  </View>;
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  container: { height: 280, overflow: 'hidden', borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  fill: { flex: 1, height: 'auto' },
  map: { flex: 1 },
  summary: { minHeight: 36, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: c.surface },
});
