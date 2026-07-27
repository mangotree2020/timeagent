import { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, radius, space } from '@/constants/design';

export function Screen({ children, scroll = true, safeBottom = false }: PropsWithChildren<{ scroll?: boolean; safeBottom?: boolean }>) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={safeBottom ? ['top', 'right', 'bottom', 'left'] : ['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : <View style={[styles.content, styles.contentFixed]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Header({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, dark = false, accessibilityLabel }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; dark?: boolean; accessibilityLabel?: string }>) {
  return <View accessibilityLabel={accessibilityLabel} style={[styles.card, dark && styles.cardDark, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, accessibilityHint }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; accessibilityHint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, tone = 'info' }: { label: string; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  return <View style={[styles.pill, styles[`pill_${tone}`]]}><Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text></View>;
}

export function SectionTitle({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  return <View style={styles.sectionTitleRow}><Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>{action}</View>;
}

export const type = StyleSheet.create({
  display: { fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.5, color: color.navy },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '900', letterSpacing: -0.5, color: color.navy },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '800', color: color.navy },
  body: { fontSize: 16, lineHeight: 24, color: color.text },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: color.textMuted },
  caption: { fontSize: 13, lineHeight: 18, color: color.textMuted },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.background },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', boxSizing: 'border-box', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: 110, gap: space.lg },
  contentFixed: { flex: 1, paddingBottom: space.md },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md },
  eyebrow: { fontSize: 13, lineHeight: 18, color: color.deepBlue, fontWeight: '700', marginBottom: 2 },
  headerTitle: { fontSize: 25, lineHeight: 32, color: color.navy, fontWeight: '900', letterSpacing: -0.5 },
  card: { borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, padding: space.xl },
  cardDark: { backgroundColor: color.navy, borderColor: color.navy },
  button: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  button_primary: { backgroundColor: color.deepBlue },
  button_secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.cyan },
  button_ghost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, fontWeight: '800' },
  buttonText_primary: { color: color.surface },
  buttonText_secondary: { color: color.deepBlue },
  buttonText_ghost: { color: color.textMuted },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  pill: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
  pill_info: { backgroundColor: color.ice },
  pill_success: { backgroundColor: color.successSoft },
  pill_warning: { backgroundColor: color.warningSoft },
  pill_danger: { backgroundColor: color.dangerSoft },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillText_info: { color: color.deepBlue },
  pillText_success: { color: color.success },
  pillText_warning: { color: color.warning },
  pillText_danger: { color: color.danger },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  sectionTitle: { fontSize: 18, lineHeight: 25, fontWeight: '900', color: color.navy },
});
