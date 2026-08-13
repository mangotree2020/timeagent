import { NaverMapMarkerOverlay, NaverMapView } from '@mj-studio/react-native-naver-map';
import { StyleSheet, View } from 'react-native';

import { color, radius } from '@/constants/design';
import { DestinationMapProps } from '@/components/destination-map';

export function DestinationMap({ coordinate, onSelect }: DestinationMapProps) {
  return <View accessibilityLabel="목적지를 직접 지정하는 지도" style={styles.container}>
    <NaverMapView
      style={styles.map}
      mapType="Basic"
      initialCamera={{ ...coordinate, zoom: 16 }}
      isShowLocationButton={!!onSelect}
      isShowZoomControls
      onTapMap={onSelect ? ({ latitude, longitude }) => onSelect({ latitude, longitude }) : undefined}
    >
      <NaverMapMarkerOverlay
        latitude={coordinate.latitude}
        longitude={coordinate.longitude}
        caption={{ text: '선택한 목적지', color: color.navy, haloColor: 'white', textSize: 13 }}
      />
    </NaverMapView>
  </View>;
}

const styles = StyleSheet.create({
  container: { height: 280, overflow: 'hidden', borderRadius: radius.md, borderWidth: 1, borderColor: color.border },
  map: { flex: 1 },
});
