import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { radius, space } from '@/constants/design';
import { clockToParts, describeClock, partsToClock } from '@/lib/appointment-date';
import { AppPalette, useThemedStyles } from '@/state/theme-context';

export const WHEEL_ITEM_HEIGHT = 56;
const VISIBLE_ROWS = 3;
const SETTLE_DELAY_MS = 140;

const PERIODS = ['오전', '오후'] as const;
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

/**
 * One column of a Galaxy-style drum: swipe up or down, the value under the band is the choice.
 * The column is a single adjustable control for assistive tech (increment/decrement), and every
 * visible value can also simply be tapped.
 */
export function WheelColumn({ label, items, selectedIndex, onChange, flex = 1, testID }: {
  label: string;
  items: readonly string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  flex?: number;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const offset = useRef(selectedIndex * WHEEL_ITEM_HEIGHT);
  const selected = useRef(selectedIndex);
  const lastItem = items.length - 1;
  useEffect(() => { selected.current = selectedIndex; }, [selectedIndex]);

  const scrollToIndex = useCallback((index: number, animated = true) => {
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
  }, []);

  // The web ScrollView ignores the initial content offset, so the drum is placed once it exists.
  useEffect(() => { scrollToIndex(selected.current, false); }, [scrollToIndex]);

  // A value set elsewhere (a restored draft, the clock typed by voice) moves the drum to match.
  // It jumps rather than glides: nobody is touching the drum, and a glide still in flight would
  // leave the band between two values for a moment.
  useEffect(() => {
    if (Math.abs(offset.current - selectedIndex * WHEEL_ITEM_HEIGHT) < 0.5) return;
    scrollToIndex(selectedIndex, false);
  }, [scrollToIndex, selectedIndex]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const commit = useCallback((y: number) => {
    const index = Math.min(lastItem, Math.max(0, Math.round(y / WHEEL_ITEM_HEIGHT)));
    if (index !== selected.current) onChange(index);
    // Settle exactly onto the row so the band never sits between two values.
    if (Math.abs(y - index * WHEEL_ITEM_HEIGHT) > 0.5) scrollToIndex(index);
  }, [lastItem, onChange, scrollToIndex]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Web and trackpads report no momentum end, so the drum settles once scrolling goes quiet.
    settleTimer.current = setTimeout(() => {
      if (!dragging.current) commit(offset.current);
    }, SETTLE_DELAY_MS);
  };
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    offset.current = event.nativeEvent.contentOffset.y;
    commit(offset.current);
  };
  const select = (index: number) => {
    if (index !== selected.current) onChange(index);
    scrollToIndex(index);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[selectedIndex] }}
      aria-valuetext={items[selectedIndex]}
      accessibilityActions={[{ name: 'increment', label: '다음 값' }, { name: 'decrement', label: '이전 값' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && selectedIndex < lastItem) select(selectedIndex + 1);
        if (event.nativeEvent.actionName === 'decrement' && selectedIndex > 0) select(selectedIndex - 1);
      }}
      testID={testID}
      style={[styles.column, { flex }]}>
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={scrollRef}
        importantForAccessibility="no-hide-descendants"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onScrollEndDrag={(event) => { dragging.current = false; onScroll(event); }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.scroll}>
        {items.map((item, index) => {
          const distance = Math.abs(index - selectedIndex);
          return (
            <Pressable key={item} onPress={() => select(index)} style={styles.item}>
              <Text
                numberOfLines={1}
                style={[styles.itemText, distance === 0 ? styles.itemTextSelected : distance === 1 ? styles.itemTextNear : styles.itemTextFar]}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** 오전/오후 · 시 · 분 drums that read and write the draft's `HH:MM` clock. */
export function TimeWheelPicker({ value, onChange }: { value: string; onChange: (clock: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const parts = clockToParts(value);
  return (
    <View>
      <View style={styles.row}>
        <WheelColumn label="오전 오후" items={PERIODS} selectedIndex={parts.period === '오전' ? 0 : 1} flex={1.15} onChange={(index) => onChange(partsToClock({ ...parts, period: PERIODS[index] }))} testID="wheel-period" />
        <WheelColumn label="시" items={HOURS} selectedIndex={parts.hour12 - 1} onChange={(index) => onChange(partsToClock({ ...parts, hour12: index + 1 }))} testID="wheel-hour" />
        <Text accessible={false} style={styles.colon}>:</Text>
        <WheelColumn label="분" items={MINUTES} selectedIndex={parts.minute} onChange={(index) => onChange(partsToClock({ ...parts, minute: index }))} testID="wheel-minute" />
      </View>
      {/* The spoken result, so the choice is confirmed in words and read out as it changes. */}
      <Text accessibilityLiveRegion="polite" style={styles.readout}>{describeClock(value)} · 위아래로 밀어서 고르세요</Text>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  column: { height: WHEEL_ITEM_HEIGHT * VISIBLE_ROWS, minWidth: 64, justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: WHEEL_ITEM_HEIGHT, height: WHEEL_ITEM_HEIGHT, borderRadius: radius.md, backgroundColor: c.selectedSoft, borderWidth: 1, borderColor: c.primarySoft },
  scroll: { flexGrow: 0 },
  content: { paddingVertical: WHEEL_ITEM_HEIGHT },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  itemTextSelected: { fontSize: 34, lineHeight: 42, fontWeight: '900', color: c.navy, letterSpacing: -0.5 },
  itemTextNear: { fontSize: 24, lineHeight: 32, fontWeight: '600', color: c.textMuted, opacity: 0.55 },
  itemTextFar: { fontSize: 22, lineHeight: 30, fontWeight: '600', color: c.textMuted, opacity: 0.25 },
  colon: { fontSize: 32, lineHeight: 40, fontWeight: '900', color: c.navy, marginBottom: 6 },
  readout: { marginTop: space.sm, textAlign: 'center', fontSize: 14, lineHeight: 20, color: c.textMuted, fontWeight: '700' },
});

export const MINUTE_WHEEL_ITEM_WIDTH = 56;
export const MINUTE_WHEEL_MAX = 120;
const MINUTE_WHEEL_HEIGHT = 52;
const MINUTE_ITEMS = Array.from({ length: MINUTE_WHEEL_MAX }, (_, index) => `${index + 1}분`);

/** One value on the sideways drum; memoized so a change re-paints only the values whose emphasis moved. */
const MinuteItem = memo(function MinuteItem({ item, index, distance, onSelect }: {
  item: string;
  index: number;
  distance: number;
  onSelect: (index: number) => void;
}) {
  const styles = useThemedStyles(createMinuteStyles);
  return (
    <Pressable onPress={() => onSelect(index)} style={styles.item}>
      <Text numberOfLines={1} style={[styles.itemText, distance === 0 ? styles.itemTextSelected : distance === 1 ? styles.itemTextNear : styles.itemTextFar]}>{item}</Text>
    </Pressable>
  );
});

/**
 * The same drum laid on its side for a preparation step's minutes: swipe left or right, the value
 * under the band is the choice. It fills whatever width its row gives it, so more values are in
 * reach per swipe. One adjustable control for assistive tech, every visible value tappable, and the
 * band itself is the 44 pt touch target.
 */
export function MinuteWheel({ label, value, onChange, testID }: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createMinuteStyles);
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const selectedIndex = Math.min(MINUTE_WHEEL_MAX - 1, Math.max(0, Math.round(value) - 1));
  const offset = useRef(selectedIndex * MINUTE_WHEEL_ITEM_WIDTH);
  const selected = useRef(selectedIndex);
  const lastItem = MINUTE_ITEMS.length - 1;
  // The side padding centres the band; it is known only once the row has laid out.
  const [width, setWidth] = useState(0);
  const sidePadding = Math.max(0, Math.round((width - MINUTE_WHEEL_ITEM_WIDTH) / 2));
  useEffect(() => { selected.current = selectedIndex; }, [selectedIndex]);

  const scrollToIndex = useCallback((index: number, animated = true) => {
    scrollRef.current?.scrollTo({ x: index * MINUTE_WHEEL_ITEM_WIDTH, animated });
  }, []);
  // Placed once the width is known; padding changes shift the content, so the drum is re-placed then.
  useEffect(() => { if (width > 0) scrollToIndex(selected.current, false); }, [scrollToIndex, width]);
  // A value set elsewhere moves the drum to match, but never while a finger is on it: on Android a
  // programmatic scroll during a drag cancels the gesture and the drum feels dead afterwards.
  useEffect(() => {
    if (dragging.current || Math.abs(offset.current - selectedIndex * MINUTE_WHEEL_ITEM_WIDTH) < 0.5) return;
    scrollToIndex(selectedIndex, false);
  }, [scrollToIndex, selectedIndex]);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const commit = useCallback((x: number) => {
    const index = Math.min(lastItem, Math.max(0, Math.round(x / MINUTE_WHEEL_ITEM_WIDTH)));
    if (index !== selected.current) { selected.current = index; onChange(index + 1); }
    if (Math.abs(x - index * MINUTE_WHEEL_ITEM_WIDTH) > 0.5) scrollToIndex(index);
  }, [lastItem, onChange, scrollToIndex]);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.x;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (!dragging.current) commit(offset.current);
    }, SETTLE_DELAY_MS);
  };
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    offset.current = event.nativeEvent.contentOffset.x;
    commit(offset.current);
  };
  const select = useCallback((index: number) => {
    if (index !== selected.current) { selected.current = index; onChange(index + 1); }
    scrollToIndex(index);
  }, [onChange, scrollToIndex]);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: MINUTE_ITEMS[selectedIndex] }}
      aria-valuetext={MINUTE_ITEMS[selectedIndex]}
      accessibilityHint="좌우로 밀어서 시간을 고르세요"
      accessibilityActions={[{ name: 'increment', label: '1분 늘리기' }, { name: 'decrement', label: '1분 줄이기' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && selectedIndex < lastItem) select(selectedIndex + 1);
        if (event.nativeEvent.actionName === 'decrement' && selectedIndex > 0) select(selectedIndex - 1);
      }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      testID={testID}
      style={styles.wheel}>
      <View pointerEvents="none" style={[styles.band, { left: sidePadding }]} />
      <ScrollView
        ref={scrollRef}
        horizontal
        importantForAccessibility="no-hide-descendants"
        nestedScrollEnabled
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        snapToInterval={MINUTE_WHEEL_ITEM_WIDTH}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        onScroll={onScroll}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onScrollEndDrag={(event) => { dragging.current = false; onScroll(event); }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.scroll}>
        {MINUTE_ITEMS.map((item, index) => (
          <MinuteItem key={item} item={item} index={index} distance={Math.min(2, Math.abs(index - selectedIndex))} onSelect={select} />
        ))}
      </ScrollView>
    </View>
  );
}

const createMinuteStyles = (c: AppPalette) => StyleSheet.create({
  wheel: { flex: 1, minWidth: MINUTE_WHEEL_ITEM_WIDTH * 3, height: MINUTE_WHEEL_HEIGHT, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.surfaceMuted, overflow: 'hidden' },
  band: { position: 'absolute', top: 2, bottom: 2, width: MINUTE_WHEEL_ITEM_WIDTH, borderRadius: radius.md, backgroundColor: c.selectedSoft, borderWidth: 1, borderColor: c.primarySoft },
  scroll: { flexGrow: 0 },
  item: { width: MINUTE_WHEEL_ITEM_WIDTH, height: MINUTE_WHEEL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  itemTextSelected: { fontSize: 18, lineHeight: 23, fontWeight: '900', color: c.navy },
  itemTextNear: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: c.textMuted, opacity: 0.55 },
  itemTextFar: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: c.textMuted, opacity: 0.25 },
});
