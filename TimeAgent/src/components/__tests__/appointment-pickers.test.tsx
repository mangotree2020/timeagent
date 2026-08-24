import { fireEvent, render } from '@testing-library/react-native';
import { PropsWithChildren } from 'react';

import { AppointmentDatePicker } from '../appointment-date-picker';
import { TimeWheelPicker, WheelColumn } from '../wheel-picker';
import { ThemeProvider } from '@/state/theme-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// The icon set ships as ES modules Jest does not transform; the pickers only need a placeholder.
jest.mock('@/components/app-icon', () => ({ AppIcon: () => null }));

const sundayNoon = new Date(2026, 7, 23, 12, 0).getTime(); // 2026-08-23 (일)

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('wheel column', () => {
  test('is one adjustable control that steps with increment and decrement', async () => {
    const onChange = jest.fn();
    const screen = await render(<WheelColumn label="시" items={['1', '2', '3']} selectedIndex={1} onChange={onChange} />, { wrapper: Wrapper });
    const wheel = screen.getByLabelText('시');
    expect(wheel.props.accessibilityValue).toEqual({ text: '2' });

    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  test('does not step past either end', async () => {
    const onChange = jest.fn();
    const screen = await render(<WheelColumn label="분" items={['00', '01']} selectedIndex={1} onChange={onChange} />, { wrapper: Wrapper });
    await fireEvent(screen.getByLabelText('분'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('a tapped value becomes the choice', async () => {
    const onChange = jest.fn();
    const screen = await render(<WheelColumn label="시" items={['1', '2', '3']} selectedIndex={0} onChange={onChange} />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('3', { includeHiddenElements: true }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe('time wheel picker', () => {
  test('shows 오전/오후, hour and minute drums for the clock and reads it back in words', async () => {
    const onChange = jest.fn();
    const screen = await render(<TimeWheelPicker value="18:05" onChange={onChange} />, { wrapper: Wrapper });
    expect(screen.getByLabelText('오전 오후').props.accessibilityValue).toEqual({ text: '오후' });
    expect(screen.getByLabelText('시').props.accessibilityValue).toEqual({ text: '6' });
    expect(screen.getByLabelText('분').props.accessibilityValue).toEqual({ text: '05' });
    expect(screen.getByText(/오후 6:05/)).toBeTruthy();

    await fireEvent(screen.getByLabelText('오전 오후'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith('06:05');
    await fireEvent(screen.getByLabelText('분'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith('18:06');
  });
});

describe('appointment date picker', () => {
  test('names today and opens a calendar that picks a later day as a one-off', async () => {
    const onChange = jest.fn();
    const screen = await render(<AppointmentDatePicker date="2026-08-23 (일)" clock="18:00" repeatWeekdays={[]} onChange={onChange} now={sundayNoon} />, { wrapper: Wrapper });
    expect(screen.getByText('오늘 · 8월 23일 (일)')).toBeTruthy();
    expect(screen.queryByText('2026년 8월')).toBeNull();

    await fireEvent.press(screen.getByLabelText('날짜 선택, 오늘 · 8월 23일 (일)'));
    expect(screen.getByText('2026년 8월')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('8월 27일 목요일'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-27 (목)', repeatWeekdays: [], recurrence: '반복 없음' });
  });

  test('refuses days that have passed', async () => {
    const onChange = jest.fn();
    const screen = await render(<AppointmentDatePicker date="2026-08-23 (일)" clock="18:00" repeatWeekdays={[]} onChange={onChange} now={sundayNoon} />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByLabelText(/^날짜 선택/));
    const yesterday = screen.getByLabelText('8월 22일 토요일');
    expect(yesterday.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(yesterday);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('choosing weekdays repeats the appointment and moves it to the first of them', async () => {
    const onChange = jest.fn();
    const screen = await render(<AppointmentDatePicker date="2026-08-23 (일)" clock="18:00" repeatWeekdays={[]} onChange={onChange} now={sundayNoon} />, { wrapper: Wrapper });
    expect(screen.getByText('반복 없음')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('화요일마다 반복'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-25 (화)', repeatWeekdays: [2], recurrence: '매주 화' });
  });

  test('a preset sets every weekday at once, and a dictated sentence is read as chips', async () => {
    const onChange = jest.fn();
    const screen = await render(<AppointmentDatePicker date="2026-08-23 (일)" clock="18:00" recurrence="매주 월·수·금" onChange={onChange} now={sundayNoon} />, { wrapper: Wrapper });
    expect(screen.getByLabelText('월요일마다 반복').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('화요일마다 반복').props.accessibilityState.checked).toBe(false);

    await fireEvent.press(screen.getByLabelText('평일 반복'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-24 (월)', repeatWeekdays: [1, 2, 3, 4, 5], recurrence: '평일마다' });
    await fireEvent.press(screen.getByLabelText('반복 끄기'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-23 (일)', repeatWeekdays: [], recurrence: '반복 없음' });
  });

  test('a picked calendar day keeps the repeat only when it falls on a repeat weekday', async () => {
    const onChange = jest.fn();
    const screen = await render(<AppointmentDatePicker date="2026-08-24 (월)" clock="18:00" repeatWeekdays={[1, 3]} onChange={onChange} now={sundayNoon} />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByLabelText(/^날짜 선택/));
    await fireEvent.press(screen.getByLabelText('8월 26일 수요일'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-26 (수)', repeatWeekdays: [1, 3], recurrence: '매주 월·수' });

    await fireEvent.press(screen.getByLabelText(/^날짜 선택/));
    await fireEvent.press(screen.getByLabelText('8월 27일 목요일'));
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-08-27 (목)', repeatWeekdays: [], recurrence: '반복 없음' });
  });
});
