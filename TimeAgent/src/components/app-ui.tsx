import { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, space } from '@/constants/design';
import { AppPalette, lightPalette, useThemedStyles } from '@/state/theme-context';

export function Screen({ children, scroll = true, safeBottom = false }: PropsWithChildren<{ scroll?: boolean; safeBottom?: boolean }>) {
  const styles = useThemedStyles(createStyles);
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={safeBottom ? ['top', 'right', 'bottom', 'left'] : ['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : <View style={[styles.content, styles.contentFixed]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Header({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
  return <View accessibilityLabel={accessibilityLabel} style={[styles.card, dark && styles.cardDark, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, accessibilityHint }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'; disabled?: boolean; accessibilityHint?: string }) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.pill, styles[`pill_${tone}`]]}><Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text></View>;
}

export function SectionTitle({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.sectionTitleRow}><Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>{action}</View>;
}

const createType = (c: AppPalette) => StyleSheet.create({
  display: { fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.5, color: c.navy },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '900', letterSpacing: -0.5, color: c.navy },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '800', color: c.navy },
  body: { fontSize: 16, lineHeight: 24, color: c.text },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: c.textMuted },
  caption: { fontSize: 13, lineHeight: 18, color: c.textMuted },
});

/** Typography that follows the active mode. Screens keep using the same `type.heading` keys. */
export function useAppType() {
  return useThemedStyles(createType);
}

/** Typography for style factories, which build their sheet outside a component. */
export const appType = createType;

/**
 * Static light typography for the places that read tokens outside a component. Prefer
 * `useAppType()` inside screens so the text follows the selected mode.
 */
export const type = createType(lightPalette);

const createStyles = (c: AppPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', boxSizing: 'border-box', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: 110, gap: space.lg },
  contentFixed: { flex: 1, paddingBottom: space.md },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md },
  eyebrow: { fontSize: 13, lineHeight: 18, color: c.deepBlue, fontWeight: '700', marginBottom: 2 },
  headerTitle: { fontSize: 24, lineHeight: 31, color: c.navy, fontWeight: '900', letterSpacing: -0.55 },
  card: { borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: space.xl, boxShadow: '0 8px 24px rgba(15,23,42,0.045)', elevation: 1 },
  cardDark: { backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse },
  button: { minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  button_primary: { backgroundColor: c.deepBlue },
  button_secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.cyan },
  button_ghost: { backgroundColor: 'transparent' },
  // Actions that cannot be undone must not look like an ordinary confirm.
  button_danger: { backgroundColor: c.danger },
  button_dangerGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.danger },
  buttonText: { fontSize: 16, fontWeight: '800' },
  buttonText_primary: { color: c.onPrimary },
  buttonText_secondary: { color: c.deepBlue },
  buttonText_ghost: { color: c.textMuted },
  buttonText_danger: { color: c.onPrimary },
  buttonText_dangerGhost: { color: c.danger },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  pill: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
  pill_info: { backgroundColor: c.primarySoft },
  pill_success: { backgroundColor: c.successSoft },
  pill_warning: { backgroundColor: c.warningSoft },
  pill_danger: { backgroundColor: c.dangerSoft },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillText_info: { color: c.deepBlue },
  pillText_success: { color: c.success },
  pillText_warning: { color: c.warning },
  pillText_danger: { color: c.danger },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  sectionTitle: { fontSize: 18, lineHeight: 25, fontWeight: '900', color: c.navy },
});
