import { Href, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { AppIcon, AppIconName } from '@/components/app-icon';
import { VOICE_PULSE_RING, VoicePulseButton } from '@/components/voice-pulse-button';
import {
  BOTTOM_NAV_ACTION_SIZE,
  BOTTOM_NAV_ITEM_MIN_HEIGHT,
  BOTTOM_NAV_MIN_HEIGHT,
  BOTTOM_NAV_TOP_PADDING,
  getBottomNavigationPadding,
} from '@/lib/bottom-navigation-layout';

const items: { href: Href; icon: AppIconName; label: string }[] = [
  { href: '/', icon: 'home', label: '홈' },
  { href: '/schedules', icon: 'calendar', label: '일정' },
  { href: '/alerts', icon: 'alert', label: '알림' },
  { href: '/settings', icon: 'settings', label: '설정' },
];

/**
 * Four tabs with the voice button docked in the middle, half above the bar: the one action that
 * starts a new appointment sits in the same place on every tab, where a thumb already rests.
 */
export function BottomNav() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tab = (item: typeof items[number]) => {
    const active = pathname === item.href;
    return (
      <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.navigate(item.href)} style={styles.item}>
        <View style={[styles.iconPill, active && styles.iconPillActive]}>
          <AppIcon name={item.icon} size={21} strokeWidth={active ? 2.5 : 2} iconColor={active ? c.deepBlue : '#8B95A1'} />
        </View>
        <Text style={[styles.label, active && styles.active]}>{item.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { paddingBottom: getBottomNavigationPadding(insets.bottom) }]}>
        {items.slice(0, 2).map(tab)}
        <View accessible={false} style={styles.actionSlot} />
        {items.slice(2).map(tab)}
      </View>
      <View pointerEvents="box-none" style={styles.actionHolder}>
        <View style={styles.actionWell} />
        <VoicePulseButton label="음성으로 새 일정 만들기" size={BOTTOM_NAV_ACTION_SIZE} onPress={() => router.push('/voice-schedule')} />
      </View>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { minHeight: BOTTOM_NAV_MIN_HEIGHT, paddingTop: BOTTOM_NAV_TOP_PADDING, paddingHorizontal: space.md, flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, boxShadow: '0 -8px 24px rgba(15,23,42,0.04)' },
  item: { flex: 1, minHeight: BOTTOM_NAV_ITEM_MIN_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionSlot: { width: BOTTOM_NAV_ACTION_SIZE + space.lg },
  // Centred on the bar's top edge: half of the button rises above it, half sits on the bar. The
  // pulse button is drawn inside a ring box (button + VOICE_PULSE_RING), so the box is centred.
  actionHolder: { position: 'absolute', left: 0, right: 0, top: -(BOTTOM_NAV_ACTION_SIZE + VOICE_PULSE_RING) / 2, height: BOTTOM_NAV_ACTION_SIZE + VOICE_PULSE_RING, alignItems: 'center', justifyContent: 'center' },
  actionWell: { position: 'absolute', width: BOTTOM_NAV_ACTION_SIZE + 8, height: BOTTOM_NAV_ACTION_SIZE + 8, borderRadius: (BOTTOM_NAV_ACTION_SIZE + 8) / 2, backgroundColor: c.background },
  iconPill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: c.primarySoft },
  label: { fontSize: 11, color: '#8B95A1', fontWeight: '700' },
  active: { color: c.deepBlue },
});
