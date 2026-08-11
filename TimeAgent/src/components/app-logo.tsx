import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { color, radius, space } from '@/constants/design';

export function AppLogo({ size = 36, style, variant = 'default', iconOnly = false }: { size?: number; style?: StyleProp<ViewStyle>; variant?: 'default' | 'dark'; iconOnly?: boolean }) {
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

const styles = StyleSheet.create({
  lockup: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
  wordmark: { color: color.navy, fontWeight: '900', letterSpacing: -0.6 },
  wordmarkDark: { color: color.surface },
  accent: { color: color.deepBlue },
});
