import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAppType } from '@/components/app-ui';
import { AppIcon, iconForTransport } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { TimelineStep } from '@/data/demo';

export function Timeline({ steps, compact = false, transport }: { steps: TimelineStep[]; compact?: boolean; transport?: string }) {
  return <View accessibilityLabel="준비 계획 타임라인">{steps.map((step, index) => <TimelineRow key={step.id} step={step} last={index === steps.length - 1} compact={compact} transport={transport} />)}</View>;
}

function TimelineRow({ step, last, compact, transport }: { step: TimelineStep; last: boolean; compact: boolean; transport?: string }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const { fontScale } = useWindowDimensions();
  const current = step.status === 'current';
  const done = step.status === 'done';
  const changed = step.status === 'changed';
  const isTransport = step.id === 'depart';
  const transportLabel = step.title.replace(/로 출발$|으로 출발$/, '') || transport || '이동';
  const timeWidth = 52 + Math.min(1, Math.max(0, fontScale - 1)) * 36;
  return (
    <View accessible={isTransport} accessibilityLabel={isTransport ? `이동수단 ${transportLabel}, ${step.duration}분` : undefined} style={[styles.row, isTransport && styles.transportRow, current && styles.currentRow]}>
      <View style={styles.rail}>
        <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent, changed && styles.dotChanged]}>
          {done ? <AppIcon name="check" size={11} strokeWidth={3} iconColor={c.surface} /> : null}
        </View>
        {!last ? <View style={[styles.line, done && styles.lineDone]} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.time, { width: timeWidth }, current && styles.currentText]}>{step.time}</Text>
      <View style={styles.copy}>
        <View style={styles.titleRow}><Text style={[compact ? type.bodyMuted : type.body, styles.title, isTransport && styles.transportTitle, current && styles.currentText]}>{step.title}</Text></View>
        {!compact || current ? <Text style={[type.caption, current && styles.currentCaption]}>{step.duration ? `${step.duration}분` : (step.note ?? '도착')}{changed ? ' · 조정됨' : ''}</Text> : null}
      </View>
      {current ? <Text numberOfLines={1} style={styles.now}>지금</Text> : null}
      {isTransport ? <View style={styles.transportIcon}><AppIcon name={iconForTransport(transportLabel)} size={22} strokeWidth={2.5} iconColor={c.deepBlue} /></View> : null}
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.md, paddingVertical: 8, paddingRight: space.md },
  currentRow: { backgroundColor: c.surfaceInverse, paddingVertical: 14, paddingHorizontal: 12, marginVertical: 4 },
  transportRow: { minHeight: 64, alignItems: 'center', marginVertical: 4, paddingLeft: 5, borderWidth: 1, borderColor: c.cyan, backgroundColor: c.infoSoft },
  rail: { width: 26, alignItems: 'center', alignSelf: 'stretch' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#A8C6D8', backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  dotDone: { borderColor: c.success, backgroundColor: c.success },
  dotCurrent: { borderColor: c.cyan, backgroundColor: c.cyan },
  dotChanged: { borderColor: c.warning, backgroundColor: c.warningSoft },
  line: { position: 'absolute', top: 17, bottom: -12, width: 2, backgroundColor: c.border },
  lineDone: { backgroundColor: c.success },
  time: { width: 52, fontSize: 13, fontWeight: '800', color: c.textMuted, paddingTop: 1 },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  transportIcon: { width: 40, height: 40, marginLeft: space.sm, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.cyan },
  title: { fontWeight: '700' },
  transportTitle: { color: c.deepBlue, fontWeight: '900' },
  currentText: { color: c.onInverse },
  currentCaption: { color: c.onInverseMuted },
  now: { flexShrink: 0, color: c.cyan, fontSize: 12, fontWeight: '900' },
});
