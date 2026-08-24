import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import {
  calendarMonthGrid,
  compareLocalDates,
  describeAppointmentDate,
  describeMonth,
  formatAppointmentDateValue,
  isSameLocalDate,
  LocalDate,
  resolveAppointmentDate,
  shiftMonth,
  toLocalDate,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/lib/appointment-date';
import {
  describeRepeatWeekdays,
  matchingRepeatPreset,
  nextRepeatDate,
  normalizeRepeatWeekdays,
  parseRepeatWeekdaysText,
  REPEAT_PRESETS,
  toggleRepeatWeekday,
} from '@/lib/appointment-recurrence';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';

/** How far ahead the calendar goes; a bare month and day can only be read one year out. */
const MONTHS_AHEAD = 12;

export type AppointmentDatePatch = { date: string; repeatWeekdays: number[]; recurrence: string };

/**
 * The date row of the appointment step: today's date with a calendar behind it, and the weekday
 * chips that turn the appointment into a weekly repeat. Picking a calendar day makes it a one-off
 * unless the day already falls on a repeat weekday; choosing weekdays moves the date forward to the
 * first of them, the way an alarm does.
 */
export function AppointmentDatePicker({ date, clock, repeatWeekdays, recurrence, onChange, now: fixedNow }: {
  date: string;
  clock: string;
  repeatWeekdays?: number[];
  recurrence?: string;
  onChange: (patch: AppointmentDatePatch) => void;
  /** Reference time for tests and fixtures; the screen otherwise reads the clock when it opens. */
  now?: number;
}) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const [openedAt] = useState(() => Date.now());
  const now = fixedNow ?? openedAt;
  const today = toLocalDate(now);
  const selected = resolveAppointmentDate(date, now);
  // A draft dictated before the chips existed carries repeat only as a sentence.
  const days = normalizeRepeatWeekdays(repeatWeekdays ?? parseRepeatWeekdaysText(recurrence));
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState({ year: selected.year, month: selected.month });
  const lastMonth = shiftMonth(today.year, today.month, MONTHS_AHEAD);
  const canGoBack = visible.year > today.year || (visible.year === today.year && visible.month > today.month);
  const canGoForward = visible.year < lastMonth.year || (visible.year === lastMonth.year && visible.month < lastMonth.month);

  const apply = (nextDays: number[], nextDate: LocalDate) => {
    onChange({ date: formatAppointmentDateValue(nextDate), repeatWeekdays: nextDays, recurrence: describeRepeatWeekdays(nextDays) });
  };
  const pickDate = (picked: LocalDate) => {
    // A chosen day stands as written; repeat only survives when the day is one of its weekdays.
    apply(days.includes(weekdayOf(picked)) ? days : [], picked);
    setVisible({ year: picked.year, month: picked.month });
    setExpanded(false);
  };
  const setDays = (nextDays: number[]) => {
    const nextDate = nextDays.length ? nextRepeatDate(nextDays, selected, clock, now) : selected;
    apply(nextDays, nextDate);
    setVisible({ year: nextDate.year, month: nextDate.month });
  };
  const toggleCalendar = () => {
    if (!expanded) setVisible({ year: selected.year, month: selected.month });
    setExpanded((open) => !open);
  };
  const preset = matchingRepeatPreset(days);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`날짜 선택, ${describeAppointmentDate(selected, now)}`}
        accessibilityHint={expanded ? '달력을 닫습니다' : '달력을 열어 날짜를 고릅니다'}
        accessibilityState={{ expanded }}
        onPress={toggleCalendar}
        style={({ pressed }) => [styles.dateRow, expanded && styles.dateRowOpen, pressed && styles.pressed]}>
        <View style={styles.dateCopy}>
          <Text style={styles.fieldLabel}>날짜</Text>
          <Text style={styles.dateValue}>{describeAppointmentDate(selected, now)}</Text>
        </View>
        <View style={[styles.calendarIcon, expanded && styles.calendarIconOpen]}><AppIcon name="calendar" size={22} iconColor={expanded ? c.onPrimary : c.deepBlue} /></View>
      </Pressable>

      {expanded ? (
        <View style={styles.calendar}>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" accessibilityState={{ disabled: !canGoBack }} disabled={!canGoBack} onPress={() => setVisible(shiftMonth(visible.year, visible.month, -1))} style={[styles.monthButton, !canGoBack && styles.monthButtonDisabled]}>
              <AppIcon name="chevronRight" size={22} style={styles.flipped} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.monthTitle}>{describeMonth(visible.year, visible.month)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: !canGoForward }} disabled={!canGoForward} onPress={() => setVisible(shiftMonth(visible.year, visible.month, 1))} style={[styles.monthButton, !canGoForward && styles.monthButtonDisabled]}>
              <AppIcon name="chevronRight" size={22} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="오늘 날짜 선택" onPress={() => pickDate(today)} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}>
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
                const past = compareLocalDates(cell.date, today) < 0;
                const isSelected = isSameLocalDate(cell.date, selected);
                const isToday = isSameLocalDate(cell.date, today);
                return (
                  <Pressable
                    key={cell.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${cell.date.month + 1}월 ${cell.date.day}일 ${WEEKDAY_LABELS[weekdayOf(cell.date)]}요일${isToday ? ', 오늘' : ''}`}
                    accessibilityState={{ selected: isSelected, disabled: past }}
                    disabled={past}
                    onPress={() => pickDate(cell.date)}
                    style={styles.dayCell}>
                    <View style={[styles.day, isToday && styles.dayToday, isSelected && styles.daySelected]}>
                      <Text style={[styles.dayText, !cell.inMonth && styles.dayTextOutside, past && styles.dayTextPast, isSelected && styles.dayTextSelected]}>{cell.date.day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text style={styles.calendarHint}>지난 날짜는 고를 수 없어요. 오늘부터 1년 안에서 선택합니다.</Text>
        </View>
      ) : null}

      <View style={styles.repeatHeader}>
        <Text style={styles.fieldLabel}>반복</Text>
        <Text accessibilityLiveRegion="polite" style={styles.repeatSummary}>{describeRepeatWeekdays(days)}</Text>
      </View>
      <View style={styles.weekdayChips}>
        {WEEKDAY_LABELS.map((label, day) => {
          const checked = days.includes(day);
          return (
            <Pressable
              key={label}
              accessibilityRole="checkbox"
              accessibilityLabel={`${label}요일마다 반복`}
              accessibilityState={{ checked }}
              onPress={() => setDays(toggleRepeatWeekday(days, day))}
              style={({ pressed }) => [styles.weekdayChip, checked && styles.weekdayChipOn, pressed && styles.pressed]}>
              <Text style={[styles.weekdayChipText, day === 0 && !checked && styles.sunday, day === 6 && !checked && styles.saturday, checked && styles.weekdayChipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.presetRow}>
        {REPEAT_PRESETS.map((item) => {
          const active = preset?.id === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 반복`}
              accessibilityState={{ selected: active }}
              onPress={() => setDays(active ? [] : item.days)}
              style={({ pressed }) => [styles.preset, active && styles.presetOn, pressed && styles.pressed]}>
              <Text style={[styles.presetText, active && styles.presetTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
        {days.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="반복 끄기" onPress={() => setDays([])} style={({ pressed }) => [styles.preset, pressed && styles.pressed]}>
            <Text style={styles.presetText}>반복 끄기</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.repeatHint}>
        {days.length
          ? `${describeRepeatWeekdays(days)} 같은 시간에 반복돼요. 약속이 끝나면 다음 회차가 자동으로 등록됩니다.`
          : '이 날짜에 한 번만 준비를 도와드려요. 요일을 고르면 매주 반복돼요.'}
      </Text>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  root: { gap: space.md },
  fieldLabel: { fontSize: 13, color: c.textMuted, fontWeight: '700' },
  dateRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  dateRowOpen: { borderColor: c.deepBlue },
  dateCopy: { flex: 1, gap: 2 },
  dateValue: { fontSize: 18, lineHeight: 26, fontWeight: '900', color: c.navy },
  calendarIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft },
  calendarIconOpen: { backgroundColor: c.deepBlue },
  pressed: { opacity: 0.72 },
  calendar: { borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: space.md, gap: 2 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  monthButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  monthButtonDisabled: { opacity: 0.3 },
  flipped: { transform: [{ rotate: '180deg' }] },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 24, fontWeight: '900', color: c.navy },
  todayButton: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  todayButtonText: { fontSize: 13, fontWeight: '800', color: c.deepBlue },
  weekRow: { flexDirection: 'row' },
  weekHeader: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '800', color: c.textMuted, paddingVertical: 4 },
  sunday: { color: c.danger },
  saturday: { color: c.deepBlue },
  dayCell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 2, borderColor: c.deepBlue },
  daySelected: { backgroundColor: c.deepBlue, borderColor: c.deepBlue },
  dayText: { fontSize: 16, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  dayTextOutside: { color: c.textMuted, opacity: 0.6 },
  dayTextPast: { opacity: 0.3, textDecorationLine: 'line-through' },
  dayTextSelected: { color: c.onPrimary, fontWeight: '900', opacity: 1 },
  calendarHint: { marginTop: space.sm, fontSize: 12, lineHeight: 17, color: c.textMuted },
  repeatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  repeatSummary: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: c.deepBlue },
  weekdayChips: { flexDirection: 'row', gap: space.xs },
  weekdayChip: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  weekdayChipOn: { backgroundColor: c.deepBlue, borderColor: c.deepBlue },
  weekdayChipText: { fontSize: 15, fontWeight: '700', color: c.text },
  weekdayChipTextOn: { color: c.onPrimary, fontWeight: '900' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  presetOn: { backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse },
  presetText: { fontSize: 13, fontWeight: '800', color: c.textMuted },
  presetTextOn: { color: c.onInverse },
  repeatHint: { fontSize: 13, lineHeight: 19, color: c.textMuted },
});
