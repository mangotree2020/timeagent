import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { type } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';
import { TimelineStep } from '@/data/demo';

export function Timeline({ steps, compact = false }: { steps: TimelineStep[]; compact?: boolean }) {
  return <View accessibilityLabel="준비 계획 타임라인">{steps.map((step, index) => <TimelineRow key={step.id} step={step} last={index === steps.length - 1} compact={compact} />)}</View>;
}

function TimelineRow({ step, last, compact }: { step: TimelineStep; last: boolean; compact: boolean }) {
  const { fontScale } = useWindowDimensions();
  const current = step.status === 'current';
  const done = step.status === 'done';
  const changed = step.status === 'changed';
  const timeWidth = 52 + Math.min(1, Math.max(0, fontScale - 1)) * 36;
  return (
    <View style={[styles.row, current && styles.currentRow]}>
      <View style={styles.rail}>
        <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent, changed && styles.dotChanged]}>
          {done ? <AppIcon name="check" size={11} strokeWidth={3} iconColor={color.surface} /> : null}
        </View>
        {!last ? <View style={[styles.line, done && styles.lineDone]} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.time, { width: timeWidth }, current && styles.currentText]}>{step.time}</Text>
      <View style={styles.copy}>
        <Text style={[compact ? type.bodyMuted : type.body, styles.title, current && styles.currentText]}>{step.title}</Text>
        {!compact || current ? <Text style={[type.caption, current && styles.currentCaption]}>{step.duration ? `${step.duration}분` : (step.note ?? '도착')}{changed ? ' · 조정됨' : ''}</Text> : null}
      </View>
      {current ? <Text numberOfLines={1} style={styles.now}>지금</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.md, paddingVertical: 8, paddingRight: space.md },
  currentRow: { backgroundColor: color.navy, paddingVertical: 14, paddingHorizontal: 12, marginVertical: 4 },
  rail: { width: 26, alignItems: 'center', alignSelf: 'stretch' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#A8C6D8', backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  dotDone: { borderColor: color.success, backgroundColor: color.success },
  dotCurrent: { borderColor: color.cyan, backgroundColor: color.cyan },
  dotChanged: { borderColor: color.warning, backgroundColor: color.warningSoft },
  line: { position: 'absolute', top: 17, bottom: -12, width: 2, backgroundColor: color.border },
  lineDone: { backgroundColor: color.success },
  time: { width: 52, fontSize: 13, fontWeight: '800', color: color.textMuted, paddingTop: 1 },
  copy: { flex: 1 },
  title: { fontWeight: '700' },
  currentText: { color: color.surface },
  currentCaption: { color: color.ice },
  now: { flexShrink: 0, color: color.cyan, fontSize: 12, fontWeight: '900' },
});
