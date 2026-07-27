import { Href, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space } from '@/constants/design';
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
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: getBottomNavigationPadding(insets.bottom) }]}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.replace(item.href)} style={styles.item}>
            <AppIcon name={item.icon} size={22} strokeWidth={active ? 2.5 : 2} iconColor={active ? color.deepBlue : '#7896AA'} />
            <Text style={[styles.label, active && styles.active]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: BOTTOM_NAV_MIN_HEIGHT, paddingTop: BOTTOM_NAV_TOP_PADDING, paddingHorizontal: space.md, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.98)', borderTopWidth: 1, borderTopColor: color.border },
  item: { flex: 1, minHeight: BOTTOM_NAV_ITEM_MIN_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 1 },
  label: { fontSize: 11, color: '#7896AA', fontWeight: '700' },
  active: { color: color.deepBlue },
});
