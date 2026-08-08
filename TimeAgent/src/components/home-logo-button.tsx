import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppLogo } from '@/components/app-logo';
import { color, radius } from '@/constants/design';

export function HomeLogoButton({ hasMessage, onPress }: { hasMessage: boolean; onPress: () => void }) {
  const [motion] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active || reduceMotion || !hasMessage) return;
      animation = Animated.loop(Animated.sequence([
        Animated.delay(1_800),
        Animated.timing(motion, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(motion, { toValue: -0.65, duration: 100, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 0.65, duration: 100, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]));
      animation.start();
    });
    return () => {
      active = false;
      animation?.stop();
      motion.setValue(0);
    };
  }, [hasMessage, motion]);

  const rotate = motion.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-7deg', '0deg', '7deg'] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasMessage ? '확인할 메시지가 있어요. 알림 보기' : '알림 보기'}
      accessibilityHint="알림 화면으로 이동합니다"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ rotate }] }}><AppLogo iconOnly size={42} /></Animated.View>
      {hasMessage ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.badge}><Text style={styles.badgeText}>!</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  badge: { position: 'absolute', right: 0, top: 0, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: color.danger, borderWidth: 2, borderColor: color.background },
  badgeText: { color: color.surface, fontSize: 11, lineHeight: 13, fontWeight: '900' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});
