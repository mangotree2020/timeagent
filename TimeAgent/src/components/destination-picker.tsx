import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, appType, useAppType } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { DestinationMap } from '@/components/destination-map';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { googleAuthProvider } from '@/lib/google-auth-provider';
import { Coordinate, GeocodedPlace } from '@/lib/journey';
import { readCurrentCoordinate } from '@/lib/current-position';
import { haversineDistanceMeters } from '@/lib/kma-weather';
import { createConfiguredMobilityProvider, MobilityApiError } from '@/lib/mobility-api';
import {
  describePlaceVerification,
  formatPlaceDistance,
  PlaceVerification,
} from '@/lib/place-verification';
import { searchSpokenPlace } from '@/lib/place-search';
import { displayAddress, loadSavedPlaces, mergeRemoteSavedPlaces, rememberPlace, SavedPlace } from '@/lib/saved-places';
import { createConfiguredSavedPlacesRemote } from '@/lib/saved-places-remote';
import { useAuth } from '@/state/auth-context';

export type DestinationValue = {
  destination: string;
  destinationAddress: string;
  destinationCoordinate: Coordinate | null;
  /** How far the chosen place is from the person, for whoever times the journey to it. */
  destinationDistanceMeters?: number | null;
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
const LOCATION_WAIT_MS = 2_500;

export function DestinationPicker({ value, onChange, title = '목적지 찾기', autoSearch = false, autoSelectExact = false, showSelectedMap = false }: DestinationPickerProps) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const provider = useMemo(() => {
    try { return createConfiguredMobilityProvider(); } catch { return null; }
  }, []);
  const { user } = useAuth();
  const remote = useMemo(() => createConfiguredSavedPlacesRemote(googleAuthProvider.getIdToken), []);
  const requestRef = useRef<AbortController | null>(null);
  const mapRequestRef = useRef(0);
  const autoSearchRef = useRef('');
  const [query, setQuery] = useState(value.destination);
  const [syncedDestination, setSyncedDestination] = useState(value.destination);
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showMap, setShowMap] = useState(false);
  /** The located place the map was last opened for, so closing it stays closed until the next one. */
  const [syncedLocatedPlace, setSyncedLocatedPlace] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapCoordinate, setMapCoordinate] = useState<Coordinate>(value.destinationCoordinate ?? DEFAULT_MAP_CENTER);
  const [mapPlace, setMapPlace] = useState<GeocodedPlace | null>(null);
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  // Set while the app is asking rather than deciding, so the list can explain itself.
  const [verification, setVerification] = useState<Extract<PlaceVerification, { kind: 'choose' }> | null>(null);

  // The owner can replace the destination after this picker is mounted, which the voice flow does on
  // every assistant turn. Without following it the field keeps searching for the name it opened with,
  // and the destination the schedule actually holds can never be located.
  if (syncedDestination !== value.destination) {
    setSyncedDestination(value.destination);
    setQuery(value.destination);
  }

  // A newly located place is a new thing to look at, so the voice flow's map opens for it. It opens
  // by setting the flag once rather than by being derived from the coordinate: derived, the map came
  // straight back on the next render after 지도 닫기 and the button did nothing at all.
  const locatedKey = value.destinationCoordinate
    ? `${value.destinationCoordinate.latitude},${value.destinationCoordinate.longitude}`
    : null;
  if (syncedLocatedPlace !== locatedKey) {
    setSyncedLocatedPlace(locatedKey);
    if (showSelectedMap && locatedKey) setShowMap(true);
  }

  const userId = user?.id ?? null;

  useEffect(() => {
    let active = true;
    loadSavedPlaces(AsyncStorage, userId).then((items) => { if (active) setSavedPlaces(items); }).catch(() => undefined);
    return () => { active = false; requestRef.current?.abort(); };
  }, [userId]);

  // The account's places live on the server so they follow the user across devices.
  // The local list renders first; the merged list replaces it when the server answers.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    remote.list().then(async (remotePlaces) => {
      if (!active || !remotePlaces?.length) return;
      const merged = await mergeRemoteSavedPlaces(AsyncStorage, remotePlaces, userId);
      if (active) setSavedPlaces(merged);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [remote, userId]);

  /** Saves locally right away and lets the server copy catch up in the background. */
  const persistPlace = useCallback(async (place: GeocodedPlace) => {
    const next = await rememberPlace(AsyncStorage, place, Date.now(), userId);
    if (userId && next.length) void remote.remember(next[0]);
    return next;
  }, [remote, userId]);

  const locateMapNearUser = async () => {
    if (value.destinationCoordinate) return;
    const here = await readCurrentCoordinate();
    if (here) setMapCoordinate(here);
  };

  /** What the list shows when the app has nothing to say about the results beyond finding them. */
  const showResults = useCallback((results: GeocodedPlace[]) => {
    setVerification(null);
    setPlaces(results);
    setStatus(results.length ? 'success' : 'empty');
    setMessage(results.length
      ? `${results.length}개의 장소를 찾았습니다.`
      : '일치하는 장소가 없습니다. 검색어를 바꾸거나 지도에서 지정해 주세요.');
  }, []);

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
      // The person's own position decides whether a name match can be trusted, so it is read before
      // the results are judged — not to steer the search, but to check what came back.
      const origin = autoSelectExact ? await readCurrentCoordinate() : null;
      const runSearch = (query: string, near: Coordinate | null) => provider
        .searchPlaces(query, near ?? mapCoordinate, controller.signal);
      // Typing a name looks it up and lists what came back. A name the assistant heard gets checked
      // instead — against where the person is, and against the spellings Korean pronunciation would
      // have hidden it behind.
      if (!autoSelectExact) {
        const results = await runSearch(normalized, origin ?? mapCoordinate);
        if (controller.signal.aborted) return;
        showResults(results);
        return;
      }

      const { verification, results, failure } = await searchSpokenPlace({
        spokenName: normalized,
        origin,
        savedPlaces,
        search: runSearch,
      });
      if (controller.signal.aborted) return;
      if (failure) throw failure;

      if (verification.kind === 'confirmed') {
        const place = verification.place;
        onChange({
          destination: place.name,
          destinationAddress: displayAddress(place),
          destinationCoordinate: place.coordinate,
          destinationDistanceMeters: origin ? haversineDistanceMeters(origin, place.coordinate) : null,
        });
        setQuery(place.name);
        setPlaces([]);
        setVerification(null);
        setStatus('idle');
        setMessage(`${place.name} 위치를 지도에서 확인했습니다.`);
        setMapCoordinate(place.coordinate);
        setMapPlace(place);
        try { setSavedPlaces(await persistPlace(place)); } catch { /* selection remains */ }
        return;
      }
      if (verification.kind === 'choose') {
        // Never substitute a name the person did not say. Show what was found and let them decide.
        setVerification(verification);
        setPlaces(verification.candidates.map((candidate) => candidate.place));
        setStatus('success');
        setMessage(describePlaceVerification(verification, normalized));
        return;
      }
      showResults(results);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPlaces([]);
      setStatus('error');
      setMessage(error instanceof MobilityApiError ? error.message : '장소를 검색하지 못했습니다. 지도에서 직접 지정할 수 있어요.');
    }
  }, [autoSelectExact, mapCoordinate, onChange, persistPlace, provider, query, readCurrentCoordinate, savedPlaces, showResults]);

  /** The distance to a place from where the person is standing, or null if that cannot be read. */
  const distanceFromHere = useCallback(async (coordinate: Coordinate) => {
    const here = await readCurrentCoordinate();
    return here ? haversineDistanceMeters(here, coordinate) : null;
  }, [readCurrentCoordinate]);

  const selectPlace = useCallback(async (place: GeocodedPlace) => {
    const selected = {
      destination: place.name,
      destinationAddress: displayAddress(place),
      destinationCoordinate: place.coordinate,
      // How far this actually is decides how long the journey takes, and here is the one moment the
      // app knows both ends of it. Null when the device cannot say where it is: the plan then falls
      // back to the per-mode default rather than timing a trip of unknown length.
      destinationDistanceMeters: await distanceFromHere(place.coordinate),
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
      const next = await persistPlace(place);
      setSavedPlaces(next);
    } catch { /* The destination remains selected even if recent-place persistence fails. */ }
  }, [onChange, persistPlace]);

  // A cleared coordinate means the destination has to be located again, even under the same name.
  useEffect(() => {
    if (!value.destinationCoordinate) autoSearchRef.current = '';
  }, [value.destinationCoordinate]);

  useEffect(() => {
    const normalized = query.trim();
    if (!autoSearch || !normalized || value.destinationCoordinate || autoSearchRef.current === normalized) return;
    autoSearchRef.current = normalized;
    void search();
  }, [autoSearch, query, search, value.destinationCoordinate]);

  const chooseMapCoordinate = async (coordinate: Coordinate) => {
    // A slow lookup for an earlier tap must not overwrite the newest tap: the pin would show one
    // spot while the confirm button saved another.
    const generation = mapRequestRef.current + 1;
    mapRequestRef.current = generation;
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
    let place = fallback;
    try {
      place = await provider.reverseGeocode(coordinate);
    } catch { /* the tapped coordinate still counts, just without an address */ }
    if (mapRequestRef.current !== generation) return;
    setMapPlace(place);
    setMapStatus('ready');
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityLabel="최근 선택한 장소 목록, 옆으로 밀어 더 보기" contentContainerStyle={styles.savedList} style={styles.savedScroll}>{savedPlaces.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`저장된 장소 ${place.name} 선택`} onPress={() => void selectPlace(place)} style={styles.savedChip}><AppIcon name="time" size={15} /><Text numberOfLines={1} style={styles.savedText}>{place.name}</Text></Pressable>)}</ScrollView>
    </View> : null}

    <View style={styles.section}>
      <Text style={styles.label}>장소명 검색</Text>
      <View style={styles.searchRow}><TextInput accessibilityLabel="목적지" returnKeyType="search" onSubmitEditing={() => void search()} placeholder="예: 서면 볼링장, 서울시청" placeholderTextColor={c.textMuted} value={query} onChangeText={(next) => { setQuery(next); onChange({ destination: next, destinationAddress: '', destinationCoordinate: null, destinationDistanceMeters: null }); setStatus('idle'); setPlaces([]); setMessage(''); }} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="목적지 검색" disabled={status === 'loading' || !query.trim()} onPress={() => void search()} style={({ pressed }) => [styles.searchButton, (!query.trim() || status === 'loading') && styles.disabled, pressed && styles.pressed]}><AppIcon name="search" size={20} iconColor={c.surface} /></Pressable></View>
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, status === 'error' && styles.error]}>{message}</Text> : null}
      {places.map((place) => {
        // While the app is asking rather than deciding, each option carries how far away it is —
        // that is the fact that tells a misheard station in another city from the right one.
        const candidate = verification?.candidates.find((item) => item.place === place) ?? null;
        const distance = formatPlaceDistance(candidate?.distanceMeters ?? null);
        const note = [distance ? `현재 위치에서 ${distance}` : '', candidate?.visitedBefore ? '전에 간 곳' : '']
          .filter(Boolean).join(' · ');
        return <Pressable key={`${place.name}-${place.coordinate.latitude}-${place.coordinate.longitude}`} accessibilityRole="button" accessibilityLabel={`${place.name}, ${displayAddress(place)}${note ? `, ${note}` : ''} 선택`} onPress={() => void selectPlace(place)} style={styles.result}><View style={styles.resultIcon}><AppIcon name="location" size={18} /></View><View style={styles.flex}><Text style={styles.resultName}>{place.name}</Text><Text style={styles.address}>{displayAddress(place)}</Text>{note ? <Text style={styles.distance}>{note}</Text> : null}</View><AppIcon name="chevronRight" size={18} iconColor={c.textMuted} /></Pressable>;
      })}
    </View>

    <Button label={showMap ? '지도 닫기' : '지도에서 직접 지정'} variant="secondary" onPress={openMap} />
    {showMap ? <View style={styles.mapSection}>
      <View style={styles.mapHint}><Text style={[type.bodyMuted, styles.flex]}>지도에서 목적지 위치를 한 번 눌러 주세요.</Text></View>
      <DestinationMap coordinate={mapCoordinate} onSelect={(coordinate) => void chooseMapCoordinate(coordinate)} onExpand={() => setMapExpanded(true)} />
      {mapStatus === 'loading' ? <Text accessibilityLiveRegion="polite" style={styles.message}>선택한 위치의 주소를 확인하고 있습니다.</Text> : null}
      {mapPlace && mapStatus === 'ready' ? <View style={styles.mapConfirm}><View style={styles.flex}><Text style={styles.resultName}>{mapPlace.name}</Text><Text style={styles.address}>{displayAddress(mapPlace)}</Text></View><Button label="이 위치 선택" onPress={() => void selectPlace(mapPlace)} /></View> : null}
    </View> : null}

    <Modal visible={mapExpanded} animationType="slide" onRequestClose={() => setMapExpanded(false)}>
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.fullMapPage}>
        <View style={styles.fullMapHeader}>
          <Text style={styles.fullMapTitle}>지도에서 장소 확인</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="지도 전체 화면 닫기" onPress={() => setMapExpanded(false)} style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}><AppIcon name="close" size={20} iconColor={c.deepBlue} /></Pressable>
        </View>
        <View style={styles.fullMapBody}>
          <DestinationMap fill coordinate={mapCoordinate} onSelect={(coordinate) => void chooseMapCoordinate(coordinate)} />
        </View>
        <View style={styles.fullMapFooter}>
          {mapStatus === 'loading' ? <Text accessibilityLiveRegion="polite" style={styles.message}>선택한 위치의 주소를 확인하고 있습니다.</Text> : null}
          {mapPlace && mapStatus === 'ready' ? <View style={styles.mapConfirm}><View style={styles.flex}><Text style={styles.resultName}>{mapPlace.name}</Text><Text style={styles.address}>{displayAddress(mapPlace)}</Text></View><Button label="이 위치 선택" onPress={() => { setMapExpanded(false); void selectPlace(mapPlace); }} /></View> : <Text style={type.bodyMuted}>지도를 눌러 목적지 위치를 지정하세요.</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  </Card>;
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
  // The scroller bleeds to the card edge so the last chip peeks in, hinting there is more to swipe.
  savedScroll: { marginHorizontal: -space.lg },
  savedList: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  savedChip: { minHeight: 44, maxWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
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
  distance: { color: c.deepBlue, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  mapSection: { gap: space.md }, mapConfirm: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface },
  mapHint: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  expandButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  fullMapPage: { flex: 1, backgroundColor: c.background },
  fullMapHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  fullMapTitle: { color: c.deepBlue, fontSize: 18, lineHeight: 25, fontWeight: '900' },
  fullMapBody: { flex: 1, paddingHorizontal: space.lg },
  fullMapFooter: { padding: space.lg, gap: space.sm },
  });
};
