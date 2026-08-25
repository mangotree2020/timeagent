import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppIcon } from '@/components/app-icon';

/** The pulse ring box extends this much beyond the button, split evenly on every side. */
export const VOICE_PULSE_RING = 18;

export function VoicePulseButton({
  onPress,
  label,
  size = 60,
  active = false,
  style,
}: {
  onPress: () => void;
  label: string;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const animate = !reduceMotion && Platform.OS !== 'web';
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); }, []);
  useEffect(() => {
    if (!animate) return;
    const animation = Animated.loop(Animated.timing(pulse, {
      toValue: 1,
      duration: active ? 1_100 : 1_800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [active, animate, pulse]);
  const ringSize = size + VOICE_PULSE_RING;
  return (
    <Animated.View style={[styles.wrap, { width: ringSize, height: ringSize }, style]}>
      {animate ? <Animated.View style={[styles.ring, {
        width: size, height: size, borderRadius: size / 2,
        opacity: pulse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.38, 0.12, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.42] }) }],
      }]} /> : <View style={[styles.ring, styles.staticRing, { width: size, height: size, borderRadius: size / 2 }]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="음성으로 새 약속을 등록합니다" onPress={onPress} style={({ pressed }) => [styles.button, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}>
        <AppIcon name="voice" size={Math.round(size * 0.42)} iconColor="#FFFFFF" strokeWidth={2.7} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', backgroundColor: '#3183F7' },
  staticRing: { opacity: 0.14, transform: [{ scale: 1.28 }] },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2F80ED', boxShadow: '0 8px 22px rgba(47,128,237,0.38)' },
  pressed: { opacity: 0.78 },
});
