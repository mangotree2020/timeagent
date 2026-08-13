import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Header, Screen, appType, useAppType } from '@/components/app-ui';
import { IconButton } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';

export type LegalSection = { title: string; paragraphs: string[] };

export function LegalDocument({
  effectiveDate,
  intro,
  sections,
  title,
}: {
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
  title: string;
}) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return (
    <Screen>
      <Header title={title} eyebrow={`시행일 ${effectiveDate}`} right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />} />
      <Text style={type.body}>{intro}</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={type.heading}>{section.title}</Text>
          {section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
        </View>
      ))}
    </Screen>
  );
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  section: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  paragraph: { ...type.body, color: c.textMuted },
  });
};
