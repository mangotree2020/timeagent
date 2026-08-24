import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import {
  calendarMonthGrid,
  describeMonth,
  isSameLocalDate,
  LocalDate,
  shiftMonth,
  toLocalDate,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/lib/appointment-date';
import { ConfirmedSchedulePlan } from '@/lib/confirmed-plans';
import { AppPalette, useThemedStyles } from '@/state/theme-context';

const MAX_DOTS = 3;

/**
 * The month at a glance, the way the phone's own calendar shows it: a dot per appointment under
 * each day, today ringed, and the chosen day filled. Picking a day is how the list below decides
 * what to show.
 */
export function PlanCalendar({ plans, selected, onSelect }: {
  plans: readonly ConfirmedSchedulePlan[];
  selected: LocalDate;
  onSelect: (date: LocalDate) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [openedAt] = useState(() => Date.now());
  const today = toLocalDate(openedAt);
  const [visible, setVisible] = useState({ year: selected.year, month: selected.month });
  const countByDay = new Map<string, number>();
  for (const plan of plans) {
    const date = toLocalDate(plan.appointmentAt);
    const key = `${date.year}-${date.month}-${date.day}`;
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }
  const pick = (date: LocalDate) => {
    onSelect(date);
    setVisible({ year: date.year, month: date.month });
  };

  return (
    <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => setVisible(shiftMonth(visible.year, visible.month, -1))} style={styles.monthButton}>
          <AppIcon name="chevronRight" size={22} style={styles.flipped} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.monthTitle}>{describeMonth(visible.year, visible.month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => setVisible(shiftMonth(visible.year, visible.month, 1))} style={styles.monthButton}>
          <AppIcon name="chevronRight" size={22} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="오늘 날짜 보기" onPress={() => pick(today)} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}>
          <Text style={styles.todayButtonText}>오늘</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text key={label} style={[styles.weekHeader, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{label}</Text>
        ))}
      </View>
      {calendarMonthGrid(visible.year, visible.month).map((row, rowIndex) => (
        <View key={rowIndex} style={styles.weekRow}>
          {row.map((cell) => {
            const count = countByDay.get(cell.key) ?? 0;
            const isSelected = isSameLocalDate(cell.date, selected);
            const isToday = isSameLocalDate(cell.date, today);
            return (
              <Pressable
                key={cell.key}
                accessibilityRole="button"
                accessibilityLabel={`${cell.date.month + 1}월 ${cell.date.day}일 ${WEEKDAY_LABELS[weekdayOf(cell.date)]}요일${isToday ? ', 오늘' : ''}${count ? `, 일정 ${count}개` : ', 일정 없음'}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => pick(cell.date)}
                style={styles.dayCell}>
                <View style={[styles.day, isToday && styles.dayToday, isSelected && styles.daySelected]}>
                  <Text style={[styles.dayText, !cell.inMonth && styles.dayTextOutside, isSelected && styles.dayTextSelected]}>{cell.date.day}</Text>
                </View>
                <View style={styles.dots}>
                  {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
                    <View key={index} style={[styles.dot, isSelected && styles.dotSelected]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  calendar: { borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: space.md, gap: 2 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  monthButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ rotate: '180deg' }] },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 24, fontWeight: '900', color: c.navy },
  todayButton: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  todayButtonText: { fontSize: 13, fontWeight: '800', color: c.deepBlue },
  pressed: { opacity: 0.72 },
  weekRow: { flexDirection: 'row' },
  weekHeader: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '800', color: c.textMuted, paddingVertical: 4 },
  sunday: { color: c.danger },
  saturday: { color: c.deepBlue },
  dayCell: { flex: 1, minHeight: 50, alignItems: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 2, borderColor: c.deepBlue },
  daySelected: { backgroundColor: c.deepBlue, borderColor: c.deepBlue },
  dayText: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  dayTextOutside: { color: c.textMuted, opacity: 0.55 },
  dayTextSelected: { color: c.onPrimary, fontWeight: '900' },
  dots: { minHeight: 8, flexDirection: 'row', gap: 3, marginTop: 2, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.deepBlue },
  dotSelected: { backgroundColor: c.deepBlue, opacity: 0.85 },
});
