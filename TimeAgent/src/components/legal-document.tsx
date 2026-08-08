import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Header, Screen, type } from '@/components/app-ui';
import { IconButton } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';

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

const styles = StyleSheet.create({
  section: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  paragraph: { ...type.body, color: color.textMuted },
});
