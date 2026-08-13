import {
  NaverMapMarkerOverlay,
  NaverMapPathOverlay,
  NaverMapView,
} from '@mj-studio/react-native-naver-map';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { JourneyMapProps } from '@/components/journey-map';

export function JourneyMap({ route, location, destinationName }: JourneyMapProps) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const [interactive, setInteractive] = useState(false);
  const coordinates = [location.coordinate, ...route.path, route.destination];
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return (
    <View accessibilityLabel="현재 위치와 목적지 이동 경로 지도" style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>{interactive ? '지도 이동·확대 조작 중' : '화면 스크롤 우선'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: interactive }}
          accessibilityLabel={interactive ? '지도 조작 끄고 화면 스크롤 사용' : '지도 이동과 확대 조작 켜기'}
          onPress={() => setInteractive((current) => !current)}
          style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}>
          <Text style={styles.toolbarButtonText}>{interactive ? '스크롤 사용' : '지도 조작'}</Text>
        </Pressable>
      </View>
      <NaverMapView
        style={styles.map}
        mapType="Basic"
        region={{
          latitude: (minLatitude + maxLatitude) / 2,
          longitude: (minLongitude + maxLongitude) / 2,
          latitudeDelta: Math.max(0.006, (maxLatitude - minLatitude) * 2),
          longitudeDelta: Math.max(0.006, (maxLongitude - minLongitude) * 2),
        }}
        isShowLocationButton={false}
        isScrollGesturesEnabled={interactive}
        isZoomGesturesEnabled={interactive}
        isTiltGesturesEnabled={interactive}
        isRotateGesturesEnabled={interactive}
        locationOverlay={{
          isVisible: true,
          position: location.coordinate,
          bearing: location.headingDegrees ?? 0,
          circleRadius: Math.min(80, location.accuracyMeters ?? 12),
          circleColor: 'rgba(0,180,216,0.18)',
          circleOutlineColor: c.cyan,
          circleOutlineWidth: 1,
        }}>
        <NaverMapPathOverlay
          coords={route.path}
          width={8}
          outlineWidth={3}
          color={c.navy}
          outlineColor="white"
          passedColor={c.textMuted}
          passedOutlineColor="white"
          progress={0}
        />
        <NaverMapMarkerOverlay
          latitude={route.destination.latitude}
          longitude={route.destination.longitude}
          image={{ symbol: 'red' }}
          caption={{ text: destinationName, color: c.navy, haloColor: 'white', textSize: 13 }}
        />
      </NaverMapView>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  container: { height: 380, overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.ice },
  map: { flex: 1 },
  toolbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.md, backgroundColor: c.surface },
  toolbarText: { flex: 1, color: c.textMuted, fontSize: 12, fontWeight: '700' },
  toolbarButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.cyan, backgroundColor: c.surface },
  toolbarButtonPressed: { opacity: 0.7 },
  toolbarButtonText: { color: c.deepBlue, fontSize: 12, fontWeight: '800' },
});
