import { createHomeGreeting } from '@/lib/home-greeting';

describe('createHomeGreeting', () => {
  test.each([
    [0, '좋은 새벽이에요, 신우철님'],
    [5, '좋은 새벽이에요, 신우철님'],
    [6, '좋은 아침이에요, 신우철님'],
    [11, '좋은 아침이에요, 신우철님'],
    [12, '좋은 오후예요, 신우철님'],
    [17, '좋은 오후예요, 신우철님'],
    [18, '좋은 저녁이에요, 신우철님'],
    [23, '좋은 저녁이에요, 신우철님'],
  ])('%i시에 시간대와 Google 이름을 사용한다', (hour, expected) => {
    expect(createHomeGreeting(new Date(2026, 7, 7, hour), ' 신우철 ')).toBe(expected);
  });

  test('Google 이름이 비어 있으면 안전한 기본 이름을 사용한다', () => {
    expect(createHomeGreeting(new Date(2026, 7, 7, 9), '   ')).toBe('좋은 아침이에요, 사용자님');
  });

  test('긴 영문 Google 이름은 첫 이름을 사용해 헤더 줄바꿈을 줄인다', () => {
    expect(createHomeGreeting(new Date(2026, 7, 7, 14), 'WOOCHUL SHIN')).toBe('좋은 오후예요, WOOCHUL님');
  });
});
