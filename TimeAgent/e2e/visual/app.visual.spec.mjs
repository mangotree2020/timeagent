import { expect, test } from '@playwright/test';

const fixedNow = new Date('2026-07-23T13:00:00+09:00');
const draft = {
  version: 1,
  step: 2,
  title: '친구와 볼링',
  date: '7월 23일 (오늘)',
  appointmentTime: '14:00',
  destination: '서면 볼링장',
  destinationAddress: '부산진구 중앙대로 672',
  destinationCoordinate: null,
  transport: 'AI 추천',
  priority: 'on-time',
  routines: [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 18 },
    { id: 'makeup', icon: 'makeup', label: '화장', minutes: 12 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
    { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
  ],
};
const personalizationProfile = {
  version: 1,
  enabled: true,
  routines: [{ key: 'shower', label: '샤워', averageMinutes: 22, sampleCount: 2, lastActualMinutes: 23, lastPlannedMinutes: 18, updatedAt: 1_721_700_000_000 }],
  transports: [{ key: 'AI 추천', label: 'AI 추천 이동', averageMinutes: 27, sampleCount: 2, lastActualMinutes: 26, lastPlannedMinutes: 24, updatedAt: 1_721_700_000_000 }],
  appliedSessionIds: ['visual-fixture-1', 'visual-fixture-2'],
};
const analyticsStore = {
  version: 1,
  events: [
    { id: '1', name: 'draft_started', at: 1_721_700_000_000, properties: {} },
    { id: '2', name: 'draft_completed', at: 1_721_700_045_000, properties: {} },
    { id: '3', name: 'notification_opened', at: 1_721_700_050_000, properties: {} },
    { id: '4', name: 'progress_started', at: 1_721_700_051_000, properties: { source: 'notification' } },
    { id: '5', name: 'delay_proposed', at: 1_721_700_052_000, properties: { minutes: 5 } },
    { id: '6', name: 'delay_applied', at: 1_721_700_053_000, properties: { minutes: 5 } },
    { id: '7', name: 'step_completed', at: 1_721_700_054_000, properties: { plannedMinutes: 18, actualMinutes: 20 } },
    { id: '8', name: 'schedule_completed', at: 1_721_700_055_000, properties: { onTime: true } },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixedNow });
  await page.addInitScript((scheduleDraft) => {
    window.localStorage.clear();
    window.localStorage.setItem('@on-time/onboarding-complete', '1');
    window.localStorage.setItem('@on-time/schedule-draft', JSON.stringify(scheduleDraft));
  }, draft);
});

const screens = [
  { id: 'home', path: '/', ready: '좋은 오후예요, 서연님' },
  { id: 'create-step-3', path: '/create', ready: '무엇을 준비해야 하나요?' },
  { id: 'voice-schedule-proposal', path: '/voice-schedule?e2eState=proposal', ready: '현재 초안과 달라지는 내용' },
  { id: 'plan', path: '/plan', ready: '준비 계획이 완성됐어요' },
  { id: 'plan-b', path: '/plan-b', ready: '플랜 B' },
  { id: 'journey-fallback', path: '/journey', ready: '연결 상태' },
  { id: 'journey-screen-reader', path: '/journey?e2eState=permission-denied&e2eScreenReader=1', ready: '화면 읽기 사용' },
  { id: 'complete', path: '/complete', ready: '일정 완료' },
  { id: 'settings', path: '/settings', ready: '내 생활에 맞게 ON:TIME을 조정하세요' },
];

async function expectVisual(page, id, { resetScroll = false } = {}) {
  await page.evaluate(async (shouldResetScroll) => {
    await document.fonts.ready;
    if (!shouldResetScroll) return;
    window.scrollTo(0, 0);
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
    }
  }, resetScroll);

  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(width.scrollWidth, `${id} 화면에 가로 넘침이 없어야 합니다`).toBeLessThanOrEqual(width.clientWidth);
  await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
}

for (const screen of screens) {
  test(`${screen.id} 화면`, async ({ page }) => {
    await page.goto(screen.path);
    await page.getByText(screen.ready, { exact: true }).waitFor({ state: 'visible' });
    await expectVisual(page, screen.id);
  });
}

test('홈 일정 추가 버튼이 내비게이션 위에 고정됨', async ({ page }) => {
  await page.goto('/');
  await page.getByText('좋은 오후예요, 서연님', { exact: true }).waitFor({ state: 'visible' });
  const floatingAction = page.getByRole('button', { name: '새 일정 추가' });
  const homeTab = page.getByRole('tab', { name: '홈' });
  const before = await floatingAction.boundingBox();
  const tab = await homeTab.boundingBox();

  expect(before).not.toBeNull();
  expect(tab).not.toBeNull();
  expect(before.y + before.height, '일정 추가 버튼 하단이 내비게이션 탭 위에 있어야 합니다').toBeLessThanOrEqual(tab.y - 12);

  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight) element.scrollTop = element.scrollHeight;
    }
  });
  const after = await floatingAction.boundingBox();
  expect(after).not.toBeNull();
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('progress-normal 화면', async ({ page }) => {
  await page.goto('/progress');
  await page.getByText('정시 도착 가능', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'progress-normal');
});

test('progress-delayed 화면', async ({ page }) => {
  await page.goto('/progress');
  await page.getByText('정시 도착 가능', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('시간 더 필요', { exact: true }).click();
  await page.getByText('+5분', { exact: true }).click();
  await page.getByText('변경안 적용', { exact: true }).click();
  await page.getByText('5분 지연', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'progress-delayed', { resetScroll: true });
});

test('personalized-plan 화면', async ({ page }) => {
  await page.addInitScript((profile) => {
    window.localStorage.setItem('@on-time/personalization', JSON.stringify(profile));
  }, personalizationProfile);
  await page.goto('/create');
  await page.getByRole('button', { name: 'AI 계획 만들기' }).click();
  await page.getByText('내 실제 기록을 반영했어요', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'personalized-plan');
});

test('mvp-metrics 화면', async ({ page }) => {
  await page.addInitScript((analytics) => {
    window.localStorage.setItem('@on-time/analytics', JSON.stringify(analytics));
  }, analyticsStore);
  await page.goto('/settings');
  await page.getByText('100%', { exact: true }).first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const metric = [...document.querySelectorAll('*')].find((element) => element.textContent === '첫 일정 생성 완료율');
    metric?.scrollIntoView({ block: 'start' });
  });
  await expectVisual(page, 'mvp-metrics');
});

test('온보딩 키보드 포커스와 실행', async ({ page }) => {
  await page.goto('/onboarding');
  const skip = page.getByRole('button', { name: '온보딩 건너뛰고 첫 일정 만들기' });
  const next = page.getByRole('button', { name: '다음' });

  await expect(skip).toHaveAttribute('tabindex', '0');
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(next).toHaveAttribute('tabindex', '0');
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByText('현재 속도에 맞춰 계획을 다시 맞춰요', { exact: true })).toBeVisible();
});
