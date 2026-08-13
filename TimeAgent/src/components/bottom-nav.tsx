import { Href, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { AppIcon, AppIconName } from '@/components/app-icon';
import {
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

export function BottomNav() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: getBottomNavigationPadding(insets.bottom) }]}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.replace(item.href)} style={styles.item}>
            <View style={[styles.iconPill, active && styles.iconPillActive]}>
              <AppIcon name={item.icon} size={21} strokeWidth={active ? 2.5 : 2} iconColor={active ? c.deepBlue : '#8B95A1'} />
            </View>
            <Text style={[styles.label, active && styles.active]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: BOTTOM_NAV_MIN_HEIGHT, paddingTop: BOTTOM_NAV_TOP_PADDING, paddingHorizontal: space.md, flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, boxShadow: '0 -8px 24px rgba(15,23,42,0.04)' },
  item: { flex: 1, minHeight: BOTTOM_NAV_ITEM_MIN_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconPill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: c.primarySoft },
  label: { fontSize: 11, color: '#8B95A1', fontWeight: '700' },
  active: { color: c.deepBlue },
});
