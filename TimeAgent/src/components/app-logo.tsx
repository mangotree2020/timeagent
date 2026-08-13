import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';

export function AppLogo({ size = 36, style, variant = 'default', iconOnly = false }: { size?: number; style?: StyleProp<ViewStyle>; variant?: 'default' | 'dark'; iconOnly?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityRole="image" accessibilityLabel="Time:Agent 로고" style={[styles.lockup, style]}>
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        source={require('../../assets/images/timeagent-alarm-logo.png')}
        style={{ width: size, height: size, borderRadius: Math.max(radius.sm, size * 0.28) }}
      />
      {iconOnly ? null : <Text style={[styles.wordmark, variant === 'dark' && styles.wordmarkDark, { fontSize: Math.max(18, size * 0.56) }]}>Time<Text style={styles.accent}>:Agent</Text></Text>}
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  lockup: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
  wordmark: { color: c.navy, fontWeight: '900', letterSpacing: -0.6 },
  wordmarkDark: { color: c.onInverse },
  accent: { color: c.deepBlue },
});
