import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GoogleGLogo } from '@/components/google-g-logo';

type GoogleAuthButtonProps = {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
};

export function GoogleAuthButton({ disabled, loading, onPress }: GoogleAuthButtonProps) {
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityHint="Google 계정을 선택해 TimeAgent에 로그인합니다"
        accessibilityLabel="Google 계정으로 로그인"
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ hovered, pressed }) => [
          styles.button,
          hovered && !disabled && styles.hovered,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}>
        <View style={styles.logo}><GoogleGLogo size={20} /></View>
        <Text style={[styles.label, disabled && styles.disabledLabel]}>Google 계정으로 로그인</Text>
        <View style={styles.trailing}>{loading ? <ActivityIndicator color="#5F6368" size="small" /> : null}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center' },
  button: {
    width: '100%', height: 56, borderRadius: 28, borderWidth: 1,
    borderColor: '#D6DFEC', backgroundColor: '#FFFFFF', flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 18,
    shadowColor: '#102A56', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12,
    shadowRadius: 12, elevation: 4,
  },
  hovered: { backgroundColor: '#F8FAFF', borderColor: '#A9B9CE' },
  pressed: { backgroundColor: '#EDF3FC', transform: [{ scale: 0.99 }] },
  disabled: { backgroundColor: '#F9FAFC', borderColor: '#E0E5EC', opacity: 0.7, elevation: 0, shadowOpacity: 0 },
  logo: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  label: {
    flex: 1, color: '#172033', fontSize: 16, lineHeight: 22, fontWeight: '700',
    letterSpacing: -0.1, textAlign: 'center',
  },
  disabledLabel: { color: '#7A8494' },
  trailing: { width: 28, alignItems: 'flex-end', justifyContent: 'center' },
});
