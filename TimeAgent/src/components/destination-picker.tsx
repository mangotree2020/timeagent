import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, appType, useAppType } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { DestinationMap } from '@/components/destination-map';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { Coordinate, GeocodedPlace } from '@/lib/journey';
import { createConfiguredMobilityProvider, MobilityApiError } from '@/lib/mobility-api';
import { displayAddress, loadSavedPlaces, rememberPlace, SavedPlace } from '@/lib/saved-places';

export type DestinationValue = {
  destination: string;
  destinationAddress: string;
  destinationCoordinate: Coordinate | null;
};

type DestinationPickerProps = {
  value: DestinationValue;
  onChange: (value: DestinationValue) => void;
  title?: string;
  autoSearch?: boolean;
  autoSelectExact?: boolean;
  showSelectedMap?: boolean;
};

const DEFAULT_MAP_CENTER = { latitude: 35.1796, longitude: 129.0756 };

export function DestinationPicker({ value, onChange, title = '목적지 찾기', autoSearch = false, autoSelectExact = false, showSelectedMap = false }: DestinationPickerProps) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const provider = useMemo(() => {
    try { return createConfiguredMobilityProvider(); } catch { return null; }
  }, []);
  const requestRef = useRef<AbortController | null>(null);
  const autoSearchRef = useRef('');
  const [query, setQuery] = useState(value.destination);
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [mapCoordinate, setMapCoordinate] = useState<Coordinate>(value.destinationCoordinate ?? DEFAULT_MAP_CENTER);
  const [mapPlace, setMapPlace] = useState<GeocodedPlace | null>(null);
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  useEffect(() => {
    let active = true;
    loadSavedPlaces(AsyncStorage).then((items) => { if (active) setSavedPlaces(items); }).catch(() => undefined);
    return () => { active = false; requestRef.current?.abort(); };
  }, []);

  const locateMapNearUser = async () => {
    if (value.destinationCoordinate) return;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
      if (last) setMapCoordinate({ latitude: last.coords.latitude, longitude: last.coords.longitude });
    } catch { /* The default map center remains available. */ }
  };

  const search = useCallback(async () => {
    const normalized = query.trim();
    if (!normalized) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setMessage('');
    if (!provider) {
      setStatus('error');
      setMessage('장소 검색 서버가 설정되지 않았습니다. 지도에서 직접 지정하거나 주소를 입력해 주세요.');
      return;
    }
    try {
      const results = await provider.searchPlaces(normalized, mapCoordinate, controller.signal);
      if (controller.signal.aborted) return;
      const exact = autoSelectExact
        ? results.filter((place) => normalizePlaceName(place.name) === normalizePlaceName(normalized))
        : [];
      if (exact.length === 1) {
        const place = exact[0];
        onChange({ destination: place.name, destinationAddress: displayAddress(place), destinationCoordinate: place.coordinate });
        setQuery(place.name);
        setPlaces([]);
        setStatus('idle');
        setMessage(`${place.name} 위치를 지도에서 확인했습니다.`);
        setMapCoordinate(place.coordinate);
        setMapPlace(place);
        try { setSavedPlaces(await rememberPlace(AsyncStorage, place)); } catch { /* selection remains */ }
        return;
      }
      setPlaces(results);
      setStatus(results.length ? 'success' : 'empty');
      setMessage(results.length ? `${results.length}개의 장소를 찾았습니다.` : '일치하는 장소가 없습니다. 검색어를 바꾸거나 지도에서 지정해 주세요.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setPlaces([]);
      setStatus('error');
      setMessage(error instanceof MobilityApiError ? error.message : '장소를 검색하지 못했습니다. 지도에서 직접 지정할 수 있어요.');
    }
  }, [autoSelectExact, mapCoordinate, onChange, provider, query]);

  const selectPlace = useCallback(async (place: GeocodedPlace) => {
    const selected = {
      destination: place.name,
      destinationAddress: displayAddress(place),
      destinationCoordinate: place.coordinate,
    };
    onChange(selected);
    setQuery(place.name);
    setPlaces([]);
    setShowMap(false);
    setStatus('idle');
    setMessage(`${place.name} 목적지를 선택했습니다.`);
    setMapCoordinate(place.coordinate);
    setMapPlace(place);
    try {
      const next = await rememberPlace(AsyncStorage, place);
      setSavedPlaces(next);
    } catch { /* The destination remains selected even if recent-place persistence fails. */ }
  }, [onChange]);

  useEffect(() => {
    const normalized = query.trim();
    if (!autoSearch || !normalized || value.destinationCoordinate || autoSearchRef.current === normalized) return;
    autoSearchRef.current = normalized;
    void search();
  }, [autoSearch, query, search, value.destinationCoordinate]);

  const chooseMapCoordinate = async (coordinate: Coordinate) => {
    setMapCoordinate(coordinate);
    setMapStatus('loading');
    const fallback: GeocodedPlace = {
      name: '지도에서 지정한 위치',
      roadAddress: '',
      jibunAddress: '',
      coordinate,
    };
    if (!provider) {
      setMapPlace(fallback);
      setMapStatus('ready');
      return;
    }
    try {
      setMapPlace(await provider.reverseGeocode(coordinate));
    } catch {
      setMapPlace(fallback);
    } finally {
      setMapStatus('ready');
    }
  };

  const openMap = () => {
    setShowMap((current) => !current);
    setMapPlace(value.destinationCoordinate ? {
      name: value.destination || '지도에서 지정한 위치',
      roadAddress: value.destinationAddress,
      jibunAddress: '',
      coordinate: value.destinationCoordinate,
    } : null);
    void locateMapNearUser();
  };

  return <Card style={styles.card}>
    <View style={styles.titleRow}><View style={styles.icon}><AppIcon name="location" size={19} /></View><View style={styles.titleCopy}><Text style={styles.title}>{title}</Text><Text style={type.caption}>장소명을 검색하거나 지도에서 위치를 눌러 지정하세요.</Text></View></View>

    {value.destinationCoordinate ? <View accessibilityLiveRegion="polite" style={styles.selected}>
      <AppIcon name="check" size={18} iconColor={c.success} />
      <View style={styles.flex}><Text style={styles.selectedName}>{value.destination}</Text><Text style={styles.address}>{value.destinationAddress}</Text></View>
    </View> : null}

    {savedPlaces.length ? <View style={styles.section}>
      <Text style={styles.label}>최근 선택한 장소</Text>
      <View style={styles.savedList}>{savedPlaces.slice(0, 4).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`저장된 장소 ${place.name} 선택`} onPress={() => void selectPlace(place)} style={styles.savedChip}><AppIcon name="time" size={15} /><Text numberOfLines={1} style={styles.savedText}>{place.name}</Text></Pressable>)}</View>
    </View> : null}

    <View style={styles.section}>
      <Text style={styles.label}>장소명 검색</Text>
      <View style={styles.searchRow}><TextInput accessibilityLabel="목적지" returnKeyType="search" onSubmitEditing={() => void search()} placeholder="예: 서면 볼링장, 서울시청" placeholderTextColor={c.textMuted} value={query} onChangeText={(next) => { setQuery(next); onChange({ destination: next, destinationAddress: '', destinationCoordinate: null }); setStatus('idle'); setPlaces([]); setMessage(''); }} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="목적지 검색" disabled={status === 'loading' || !query.trim()} onPress={() => void search()} style={({ pressed }) => [styles.searchButton, (!query.trim() || status === 'loading') && styles.disabled, pressed && styles.pressed]}><AppIcon name="search" size={20} iconColor={c.surface} /></Pressable></View>
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, status === 'error' && styles.error]}>{message}</Text> : null}
      {places.map((place) => <Pressable key={`${place.name}-${place.coordinate.latitude}-${place.coordinate.longitude}`} accessibilityRole="button" accessibilityLabel={`${place.name}, ${displayAddress(place)} 선택`} onPress={() => void selectPlace(place)} style={styles.result}><View style={styles.resultIcon}><AppIcon name="location" size={18} /></View><View style={styles.flex}><Text style={styles.resultName}>{place.name}</Text><Text style={styles.address}>{displayAddress(place)}</Text></View><AppIcon name="chevronRight" size={18} iconColor={c.textMuted} /></Pressable>)}
    </View>

    <Button label={showMap ? '지도 닫기' : '지도에서 직접 지정'} variant="secondary" onPress={openMap} />
    {showMap || (showSelectedMap && value.destinationCoordinate) ? <View style={styles.mapSection}>
      <Text style={type.bodyMuted}>지도에서 목적지 위치를 한 번 눌러 주세요.</Text>
      <DestinationMap coordinate={mapCoordinate} onSelect={(coordinate) => void chooseMapCoordinate(coordinate)} />
      {mapStatus === 'loading' ? <Text accessibilityLiveRegion="polite" style={styles.message}>선택한 위치의 주소를 확인하고 있습니다.</Text> : null}
      {mapPlace && mapStatus === 'ready' ? <View style={styles.mapConfirm}><View style={styles.flex}><Text style={styles.resultName}>{mapPlace.name}</Text><Text style={styles.address}>{displayAddress(mapPlace)}</Text></View><Button label="이 위치 선택" onPress={() => void selectPlace(mapPlace)} /></View> : null}
    </View> : null}
  </Card>;
}

function normalizePlaceName(value: string) {
  return value.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  card: { gap: space.lg, backgroundColor: c.infoSoft, padding: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  titleCopy: { flex: 1, gap: 2 }, title: { color: c.deepBlue, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  selected: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.successSoft, borderWidth: 1, borderColor: c.success },
  selectedName: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  section: { gap: space.sm }, label: { fontSize: 13, color: c.textMuted, fontWeight: '800' },
  savedList: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  savedChip: { minHeight: 44, maxWidth: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  savedText: { flexShrink: 1, color: c.deepBlue, fontSize: 13, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: space.sm },
  input: { flex: 1, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, fontSize: 16, color: c.text },
  searchButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: c.deepBlue },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  message: { ...type.caption, color: c.deepBlue, fontWeight: '700' }, error: { color: c.danger },
  result: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  resultIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice },
  resultName: { color: c.navy, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  address: { color: c.textMuted, fontSize: 13, lineHeight: 18 }, flex: { flex: 1 },
  mapSection: { gap: space.md }, mapConfirm: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface },
  });
};
