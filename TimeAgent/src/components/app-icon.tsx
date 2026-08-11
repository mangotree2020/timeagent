import Bell from 'lucide-react-native/icons/bell';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import BusFront from 'lucide-react-native/icons/bus-front';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CarFront from 'lucide-react-native/icons/car-front';
import CarTaxiFront from 'lucide-react-native/icons/car-taxi-front';
import ChartNoAxesColumnIncreasing from 'lucide-react-native/icons/chart-no-axes-column-increasing';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Diamond from 'lucide-react-native/icons/diamond';
import CloudFog from 'lucide-react-native/icons/cloud-fog';
import CloudLightning from 'lucide-react-native/icons/cloud-lightning';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import CloudSun from 'lucide-react-native/icons/cloud-sun';
import Footprints from 'lucide-react-native/icons/footprints';
import Home from 'lucide-react-native/icons/house';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mic2 from 'lucide-react-native/icons/mic';
import Minus from 'lucide-react-native/icons/minus';
import Navigation from 'lucide-react-native/icons/navigation';
import PackageCheck from 'lucide-react-native/icons/package-check';
import Palette from 'lucide-react-native/icons/palette';
import Plus from 'lucide-react-native/icons/plus';
import Settings from 'lucide-react-native/icons/settings';
import Search from 'lucide-react-native/icons/search';
import Shirt from 'lucide-react-native/icons/shirt';
import ShowerHead from 'lucide-react-native/icons/shower-head';
import Snowflake from 'lucide-react-native/icons/snowflake';
import Sparkles from 'lucide-react-native/icons/sparkles';
import SunMedium from 'lucide-react-native/icons/sun-medium';
import TrainFront from 'lucide-react-native/icons/train-front';
import WandSparkles from 'lucide-react-native/icons/wand-sparkles';
import Volume2 from 'lucide-react-native/icons/volume-2';
import VolumeX from 'lucide-react-native/icons/volume-x';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { color, radius } from '@/constants/design';

const icons = {
  alert: Bell,
  bag: BriefcaseBusiness,
  bus: BusFront,
  calendar: CalendarDays,
  car: CarFront,
  taxi: CarTaxiFront,
  chart: ChartNoAxesColumnIncreasing,
  check: Check,
  chevronRight: ChevronRight,
  error: CircleAlert,
  success: CircleCheckBig,
  time: Clock3,
  achievement: Diamond,
  weatherCloudy: CloudSun,
  weatherFog: CloudFog,
  weatherRain: CloudRain,
  weatherSnow: Snowflake,
  weatherStorm: CloudLightning,
  walk: Footprints,
  home: Home,
  location: MapPin,
  voice: Mic2,
  speaker: Volume2,
  mute: VolumeX,
  minus: Minus,
  navigation: Navigation,
  ready: PackageCheck,
  makeup: Palette,
  plus: Plus,
  settings: Settings,
  search: Search,
  dress: Shirt,
  shower: ShowerHead,
  coach: Sparkles,
  routine: SunMedium,
  weatherClear: SunMedium,
  subway: TrainFront,
  ai: WandSparkles,
  close: X,
  quick: Zap,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  size = 20,
  iconColor = color.deepBlue,
  strokeWidth = 2,
  style,
}: {
  name: AppIconName;
  size?: number;
  iconColor?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const Icon = icons[name];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.iconBox, { width: size, height: size }, style]}>
      <Icon color={iconColor} size={size} strokeWidth={strokeWidth} />
    </View>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  size = 22,
  iconColor = color.deepBlue,
  variant = 'surface',
}: {
  name: AppIconName;
  label: string;
  onPress: () => void;
  size?: number;
  iconColor?: string;
  variant?: 'surface' | 'plain' | 'primary';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed]}>
      <AppIcon name={name} size={size} iconColor={variant === 'primary' ? color.surface : iconColor} />
    </Pressable>
  );
}

export function iconForTransport(value: string): AppIconName {
  if (value.includes('AI')) return 'ai';
  if (value.includes('지하철')) return 'subway';
  if (value.includes('버스')) return 'bus';
  if (value.includes('도보')) return 'walk';
  if (value.includes('택시')) return 'taxi';
  return 'car';
}

export function iconForRoutine(id: string, legacyIcon?: string): AppIconName {
  if (id.includes('shower') || legacyIcon === '🚿') return 'shower';
  if (id.includes('makeup') || legacyIcon === '🧴') return 'makeup';
  if (id.includes('dress') || legacyIcon === '👕') return 'dress';
  if (id.includes('bag') || legacyIcon === '🎒') return 'bag';
  return 'ready';
}

const styles = StyleSheet.create({
  iconBox: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  button: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  button_surface: { backgroundColor: color.surface },
  button_plain: { backgroundColor: 'transparent' },
  button_primary: { backgroundColor: color.deepBlue },
  pressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
});
