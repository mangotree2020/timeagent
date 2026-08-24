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
const confirmedPlanFixture = {
  version: 1,
  id: 'visual-confirmed-plan',
  schedule: { ...draft, title: '서면 볼링장 친구 약속', date: '오늘, 7월 23일' },
  plan: {
    preparationMinutes: 37,
    travelMinutes: 24,
    bufferMinutes: 4,
    prepStart: '12:55',
    departure: '13:32',
    arrival: '13:56',
    status: { kind: 'ready', label: '4분 여유', tone: 'success', minutes: 4 },
    timeline: [
      { id: 'wash', time: '12:55', title: '세안', duration: 5, status: 'upcoming' },
      { id: 'shower', time: '13:00', title: '샤워', duration: 15, status: 'upcoming' },
      { id: 'makeup', time: '13:15', title: '화장', duration: 9, status: 'upcoming' },
      { id: 'dress', time: '13:24', title: '옷 입기', duration: 6, status: 'upcoming' },
      { id: 'bag', time: '13:30', title: '짐 챙기기', duration: 2, status: 'upcoming' },
      { id: 'depart', time: '13:32', title: '지하철로 출발', duration: 24, status: 'upcoming' },
      { id: 'arrive', time: '13:56', title: '도착 예정', duration: 0, status: 'upcoming' },
    ],
    personalizationAdjustments: [],
  },
  appointmentAt: fixedNow.getTime() + 60 * 60_000,
  prepStartAt: fixedNow.getTime() - 5 * 60_000,
  confirmedAt: fixedNow.getTime() - 60 * 60_000,
  state: 'scheduled',
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
const plusEligibleAnalyticsStore = {
  version: 1,
  events: [
    { id: 'p1', name: 'schedule_completed', at: 1_721_700_001_000, properties: { onTime: true } },
    { id: 'p2', name: 'schedule_completed', at: 1_721_700_002_000, properties: { onTime: true } },
    { id: 'p3', name: 'schedule_completed', at: 1_721_700_003_000, properties: { onTime: false } },
  ],
};
const plusInterestFixture = {
  version: 1,
  status: 'interested',
  plan: 'annual',
  updatedAt: 1_721_700_004_000,
};
const authSession = {
  version: 1,
  user: { id: 'visual-google-user', email: 'seoyeon@example.com', name: '서연', photo: null },
};
const searchedPlace = {
  name: '서울특별시청',
  roadAddress: '서울특별시 중구 세종대로 110',
  jibunAddress: '서울특별시 중구 태평로1가 31',
  coordinate: { latitude: 37.56661, longitude: 126.978388 },
};

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixedNow });
  await page.addInitScript(({ scheduleDraft, googleSession, confirmedPlan }) => {
    window.localStorage.clear();
    window.localStorage.setItem('@on-time/onboarding-complete', '3');
    window.localStorage.setItem('@on-time/schedule-draft', JSON.stringify(scheduleDraft));
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [confirmedPlan] }));
    if (!window.location.search.includes('e2eAuth=signed-out')) {
      window.localStorage.setItem('@on-time/google-auth-session', JSON.stringify(googleSession));
    }
  }, { scheduleDraft: draft, googleSession: authSession, confirmedPlan: confirmedPlanFixture });
});

const screens = [
  { id: 'home', path: '/?e2eCalendar=today', ready: '오늘의 준비 계획' },
  { id: 'home-on-time-streak', path: '/?e2eCalendar=today&e2eStreak=5', ready: '연속 5회 정시 도착 중' },
  { id: 'alerts', path: '/alerts?e2eWeather=ready', ready: '필요한 순간만 알려드려요' },
  { id: 'create-step-3', path: '/create', ready: '무엇을 준비해야 하나요?' },
  { id: 'voice-schedule-proposal', path: '/voice-schedule?e2eState=proposal', ready: '이렇게 등록할까요?' },
  { id: 'voice-schedule-auto', path: '/voice-schedule?e2eState=auto-listening', ready: '실시간 대화 · 자동 듣기' },
  { id: 'voice-schedule-clarification', path: '/voice-schedule?e2eState=clarification', ready: '금요일 오후 몇 시로 등록할까요?' },
  { id: 'voice-schedule-transport', path: '/voice-schedule?e2eState=transport-missing', ready: '어떻게 이동할까요?' },
  { id: 'voice-task-proposal', path: '/voice-schedule?e2eState=task', ready: '지금 시작할 만큼 나눴어요' },
  { id: 'calendar-events', path: '/schedules?e2eCalendar=events', ready: '기기 캘린더 일정' },
  { id: 'plan', path: '/plan', ready: '확정된 준비 계획' },
  { id: 'plan-b', path: '/plan-b', ready: '플랜 B' },
  { id: 'journey-fallback', path: '/journey', ready: '연결 상태' },
  { id: 'journey-screen-reader', path: '/journey?e2eState=permission-denied&e2eScreenReader=1', ready: '화면 읽기 사용' },
  { id: 'complete', path: '/complete', ready: '일정 완료' },
  { id: 'settings', path: '/settings', ready: '내 생활에 맞게 TimeAgent를 조정하세요' },
];

const darkSettings = {
  version: 3,
  defaultLocation: '부산진구 부전동',
  preferredTransport: '대중교통',
  bufferMinutes: 5,
  routinePreset: '기본 외출 준비',
  preparationGender: 'unspecified',
  coachTone: '친근하게',
  voiceControl: true,
  notifications: true,
  colorMode: 'dark',
};

const darkScreens = [
  { id: 'dark-home', path: '/?e2eCalendar=today', ready: '오늘의 준비 계획' },
  { id: 'dark-plan', path: '/plan', ready: '확정된 준비 계획' },
  { id: 'dark-schedules', path: '/schedules', ready: '내 일정' },
  { id: 'dark-settings', path: '/settings', ready: '내 생활에 맞게 TimeAgent를 조정하세요' },
];

for (const screen of darkScreens) {
  test(`${screen.id} 화면`, async ({ page }) => {
    await page.addInitScript((settings) => {
      window.localStorage.setItem('@on-time/app-settings', JSON.stringify(settings));
    }, darkSettings);
    await page.goto(screen.path);
    await page.getByText(screen.ready, { exact: true }).waitFor({ state: 'visible' });
    await expectVisual(page, screen.id);
  });
}

test('설정에서 준비 단계 음성 코치를 끄고 켤 수 있음', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('내 생활에 맞게 TimeAgent를 조정하세요', { exact: true })).toBeVisible();

  const coach = page.getByRole('switch', { name: /준비 단계 음성 코치/ });
  await coach.scrollIntoViewIfNeeded();
  await expect(coach).toBeVisible();
  await expect(page.getByText('단계마다 알림과 음성으로 챙겨줘요', { exact: true })).toBeVisible();

  await coach.click();
  await expect(page.getByText('단계 시작 알림과 음성을 끔', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem('@on-time/app-settings');
    return raw ? JSON.parse(raw).stepCoaching : null;
  })).toBe(false);

  await coach.click();
  await expect(page.getByText('단계마다 알림과 음성으로 챙겨줘요', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem('@on-time/app-settings');
    return raw ? JSON.parse(raw).stepCoaching : null;
  })).toBe(true);
});

test('계정 삭제는 목적과 삭제 범위를 항목으로 안내함', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('내 생활에 맞게 TimeAgent를 조정하세요', { exact: true })).toBeVisible();

  // The entry has to explain why it exists, since logging out looks like the same thing.
  await expect(page.getByText('로그아웃은 이 기기의 일정과 기록을 그대로 둡니다. 앱 연결까지 끊고 데이터를 모두 지우려면 이 항목을 사용하세요.', { exact: true })).toBeVisible();

  const entry = page.getByRole('button', { name: '계정 삭제', exact: true });
  await entry.scrollIntoViewIfNeeded();
  await entry.click();

  await expect(page.getByText('삭제되는 항목', { exact: true })).toBeVisible();
  await expect(page.getByText('· 서버에 저장된 최근 장소', { exact: true })).toBeVisible();
  await expect(page.getByText('삭제되지 않는 항목', { exact: true })).toBeVisible();
  await expect(page.getByText('· Google 계정 자체', { exact: true })).toBeVisible();
  await expect(page.getByText('삭제 후에는 복구할 수 없습니다.', { exact: true })).toBeVisible();

  // Cancelling must leave the account untouched.
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByText('삭제되는 항목', { exact: true })).toHaveCount(0);
  await expect(entry).toBeVisible();
});

test('되돌릴 수 없는 삭제는 일반 확인과 다르게 보임', async ({ page }) => {
  await page.goto('/plan');
  const deleteEntry = page.getByRole('button', { name: '약속 삭제', exact: true });
  await deleteEntry.scrollIntoViewIfNeeded();
  await deleteEntry.click();

  const confirm = page.getByRole('button', { name: '삭제 확인', exact: true });
  const cancel = page.getByRole('button', { name: '삭제 취소', exact: true });
  await expect(confirm).toBeVisible();

  const [confirmColor, cancelColor] = await Promise.all([
    confirm.evaluate((node) => getComputedStyle(node).backgroundColor),
    cancel.evaluate((node) => getComputedStyle(node).backgroundColor),
  ]);
  const primaryColor = await page.getByRole('button', { name: '약속 수정', exact: true })
    .evaluate((node) => getComputedStyle(node).backgroundColor);

  expect(confirmColor, '삭제 확인은 일반 확인 버튼과 같은 색이면 안 됩니다').not.toBe(primaryColor);
  expect(confirmColor).not.toBe(cancelColor);
  expect(redShare(confirmColor), '삭제 확인은 경고 색이어야 합니다').toBeGreaterThan(0.45);
});

function redShare(cssColor) {
  const [r, g, b] = cssColor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const total = r + g + b;
  return total ? r / total : 0;
}

test('다크 모드는 배경과 본문 대비를 뒤집어 적용함', async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.setItem('@on-time/app-settings', JSON.stringify(settings));
  }, darkSettings);
  await page.goto('/settings');
  await expect(page.getByText('내 생활에 맞게 TimeAgent를 조정하세요', { exact: true })).toBeVisible();

  const heading = page.getByRole('heading', { name: '설정', exact: true });
  const headingColor = await heading.evaluate((node) => getComputedStyle(node).color);
  // The screen background is the innermost painted element covering the most area, so the router's
  // own container behind the app does not win the comparison.
  const pageBackground = await page.evaluate(() => {
    let best = { area: 0, color: 'rgb(255, 255, 255)' };
    for (const node of document.querySelectorAll('div')) {
      const background = getComputedStyle(node).backgroundColor;
      if (!background || background === 'rgba(0, 0, 0, 0)') continue;
      const box = node.getBoundingClientRect();
      const area = box.width * box.height;
      if (area >= best.area) best = { area, color: background };
    }
    return best.color;
  });

  expect(luminance(headingColor), '다크 모드 제목은 밝아야 합니다').toBeGreaterThan(0.6);
  expect(luminance(pageBackground), '다크 모드 배경은 어두워야 합니다').toBeLessThan(0.25);
  await expect(page.getByText('다크 모드', { exact: true })).toBeVisible();
});

function luminance(cssColor) {
  const [r, g, b] = cssColor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

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
    if (screen.id === 'home-on-time-streak') {
      await page.getByRole('button', { name: /연속 5회 정시 도착 중/ }).scrollIntoViewIfNeeded();
    }
    await expectVisual(page, screen.id);
  });
}

test('확정 계획 저장 카드는 선명한 완료 CTA로 홈에 이동함', async ({ page }) => {
  await page.goto('/plan');
  const savedAppointment = page.getByRole('button', { name: '약속이 저장됐습니다. 홈으로 이동', exact: true });
  await savedAppointment.scrollIntoViewIfNeeded();
  await expect(savedAppointment).toBeVisible();
  await expect(savedAppointment.getByText('약속이 저장됐습니다.', { exact: true })).toBeVisible();
  const box = await savedAppointment.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height, '저장 완료 카드 터치 영역은 최소 80px이어야 합니다').toBeGreaterThanOrEqual(80);
  await expectVisual(page, 'plan-saved-confirmation');
  await savedAppointment.click();
  await expect(page).toHaveURL(/\/$/);
});

test('확정 계획은 지도·이동수단·수정·삭제 행동을 제공함', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByText('서면 볼링장', { exact: true })).toBeVisible();
  await expect(page.getByText('서면 볼링장 · 13:56 도착 예정', { exact: true })).toHaveCount(0);
  await expect(page.getByText('4분\n여유', { exact: true })).toBeVisible();
  const destination = page.getByText('서면 볼링장', { exact: true });
  const mapToggle = page.getByRole('button', { name: '지도 보기', exact: true });
  const arrivalMetric = page.getByLabel('도착 13:56, 4분 여유', { exact: true });
  const transport = page.getByLabel('이동수단 지하철, 24분', { exact: true });
  await expect(transport).toBeVisible();

  const [destinationBox, mapToggleBox, arrivalTimeBox, arrivalStatusBox, transportTitleBox, transportIconBox] = await Promise.all([
    destination.boundingBox(),
    mapToggle.boundingBox(),
    arrivalMetric.getByText('13:56', { exact: true }).boundingBox(),
    arrivalMetric.getByText('4분\n여유', { exact: true }).boundingBox(),
    transport.getByText('지하철로 출발', { exact: true }).boundingBox(),
    transport.locator('svg').boundingBox(),
  ]);
  expect(Math.abs(destinationBox.y - mapToggleBox.y), '지도 보기는 약속 장소명 옆에 있어야 합니다').toBeLessThan(16);
  expect(mapToggleBox.x).toBeGreaterThan(destinationBox.x + destinationBox.width);
  expect(Math.abs(arrivalTimeBox.y - arrivalStatusBox.y), '여유 표시는 도착 시간 옆에 있어야 합니다').toBeLessThan(16);
  expect(arrivalStatusBox.x).toBeGreaterThan(arrivalTimeBox.x + arrivalTimeBox.width);
  expect(transportIconBox.x, '이동수단 아이콘은 카드 오른쪽 끝에 있어야 합니다').toBeGreaterThan(transportTitleBox.x + transportTitleBox.width);

  await mapToggle.click();
  await expect(page.getByText('도착 장소 지도', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '지도 접기', exact: true })).toBeVisible();
  await expectVisual(page, 'plan-map-open');

  await page.getByRole('button', { name: '약속 수정', exact: true }).click();
  await expect(page).toHaveURL(/\/create\?edit=1$/);
  await expect(page.getByRole('textbox', { name: '일정 이름' })).toHaveValue('서면 볼링장 친구 약속');
  await expect(page.getByRole('heading', { name: '약속 수정', exact: true })).toBeVisible();
});

test('확정 약속 삭제는 확인 후 저장소와 화면에서 제거함', async ({ page }) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: '약속 삭제', exact: true }).click();
  await expect(page.getByText('이 약속을 삭제할까요?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '삭제 취소', exact: true }).click();
  await expect(page.getByText('이 약속을 삭제할까요?', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '약속 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans')).plans.length)).toBe(0);
});

test('확정 약속 수정은 기존 항목을 중복 없이 교체함', async ({ page }) => {
  await page.addInitScript(() => {
    const saved = JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans'));
    saved.plans[0].schedule.destinationCoordinate = { latitude: 35.1577, longitude: 129.0592 };
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify(saved));
  });
  await page.goto('/plan');
  await page.getByRole('button', { name: '약속 수정', exact: true }).click();
  const title = page.getByRole('textbox', { name: '일정 이름' });
  await title.fill('수정한 볼링 약속');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '수정 계획 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '수정한 준비 계획을 확인해 주세요', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: '수정한 약속 저장', exact: true }).last().click();
  await expect(page).toHaveURL(/\/schedules$/);
  const plans = await page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans')).plans);
  expect(plans).toHaveLength(1);
  expect(plans[0].schedule.title).toBe('수정한 볼링 약속');
});

test('로그인 전 온보딩 3개 화면', async ({ page }) => {
  await page.goto('/onboarding');
  await page.getByText('약속만 말해줘.\n준비는 내가 할게.', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'onboarding-1');

  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByText('늦을 것 같으면\n바로 다시 짜드려요.', { exact: true })).toBeVisible();
  await expectVisual(page, 'onboarding-2');

  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByText('말로 하면\n3초면 끝나요.', { exact: true })).toBeVisible();
  await expectVisual(page, 'onboarding-3');
});

test('첫 실행은 온보딩 3장 뒤 Google 로그인 화면을 보여줌', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem('@on-time/onboarding-complete'));
  await page.goto('/?e2eAuth=signed-out');
  await expect(page.getByText('약속만 말해줘.\n준비는 내가 할게.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByText('늦을 것 같으면\n바로 다시 짜드려요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByText('말로 하면\n3초면 끝나요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByText('로그인하면 오늘 일정과 지금 해야 할 행동을 바로 확인할 수 있어요.', { exact: true }).waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: 'Google 계정으로 로그인' })).toBeDisabled();
  await expect(page.getByText('이름과 이메일만 로그인에 사용하며 일정과 위치 기록은 이 기기에 보관해요.', { exact: true })).toBeVisible();
  await expectVisual(page, 'google-sign-in');
});

test('새 일정은 30분 이후 기본값을 보여주고 이름 입력을 바로 교체함', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true }).click();
  await page.getByRole('button', { name: '키보드로 직접 입력·수정', exact: true }).click();
  const title = page.getByRole('textbox', { name: '일정 이름' });

  await expect(title).toHaveValue('목요일 오후 약속');
  // The clock is chosen on 오전/오후·시·분 drums and the date on a calendar row, so the values are
  // read from the spoken readout and the row label rather than text boxes.
  await expect(page.getByText(/^오후 1:35/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^날짜 선택, 오늘 · 7월 23일 \(목\)/ })).toBeVisible();
  await expectVisual(page, 'create-step-1-default');

  await title.click();
  await page.keyboard.type('치과 검진');
  await expect(title).toHaveValue('치과 검진');
});

test('약속 시간은 휠로, 날짜는 달력으로 고르고 요일을 켜면 매주 반복됨', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true }).click();
  await page.getByRole('button', { name: '키보드로 직접 입력·수정', exact: true }).click();
  await expect(page.getByText(/^오후 1:35/)).toBeVisible();

  // Five rows down on the minute drum: 35 → 40.
  const minute = page.getByRole('slider', { name: '분' });
  await minute.hover();
  await page.mouse.wheel(0, 56 * 5);
  await expect(page.getByText(/^오후 1:40/)).toBeVisible();
  await expect(minute).toHaveAttribute('aria-valuetext', '40');

  await page.getByRole('button', { name: /^날짜 선택, 오늘 · 7월 23일 \(목\)/ }).click();
  await expect(page.getByRole('heading', { name: '2026년 7월' })).toBeVisible();
  await expect(page.getByRole('button', { name: '7월 22일 수요일' })).toBeDisabled();
  await expectVisual(page, 'create-calendar-open');
  await page.getByRole('button', { name: '7월 30일 목요일' }).click();
  await expect(page.getByRole('button', { name: /^날짜 선택, 7월 30일 \(목\)/ })).toBeVisible();

  await page.getByRole('checkbox', { name: '금요일마다 반복' }).click();
  await expect(page.getByRole('button', { name: /^날짜 선택, 7월 31일 \(금\)/ })).toBeVisible();
  await expect(page.getByText('매주 금', { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const saved = JSON.parse(window.localStorage.getItem('@on-time/schedule-draft') ?? '{}');
    return saved.date === '2026-07-31 (금)' && saved.appointmentTime === '13:40' && saved.repeatWeekdays?.join() === '5' && saved.recurrence === '매주 금';
  });
  await expectVisual(page, 'create-repeat-friday');

  await page.getByRole('button', { name: '반복 끄기', exact: true }).click();
  await expect(page.getByText('반복 없음', { exact: true })).toBeVisible();
});

test('선택한 성별의 기본 준비 항목을 새 일정에 적용함', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /성별에 따른 기본 준비 항목/ }).click();
  await page.getByRole('radio', { name: '남성', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('@on-time/app-settings') ?? '{}').preparationGender === 'male');
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true }).click();
  await page.getByRole('button', { name: '키보드로 직접 입력·수정', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('@on-time/schedule-draft') ?? '{}').routines?.some((routine) => routine.label === '면도'));
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('면도', { exact: true })).toBeVisible();
  await expect(page.getByText('헤어 정돈', { exact: true })).toBeVisible();
  await expect(page.getByText('화장', { exact: true })).toBeHidden();
});

test('설정의 이동 수단 선택지를 한 줄로 표시함', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /선호 이동수단/ }).click();

  const options = ['대중교통', '승용차(택시)', '도보'];
  const boxes = await Promise.all(options.map((name) => page.getByRole('radio', { name, exact: true }).boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const top = boxes[0].y;
  for (const box of boxes) {
    expect(Math.abs(box.y - top), `${box} 이동 수단이 같은 줄에 있어야 합니다`).toBeLessThanOrEqual(1);
    expect(box.height, '이동 수단의 터치 영역은 44px 이상이어야 합니다').toBeGreaterThanOrEqual(44);
  }
});

test('설정의 준비 루틴 선택지를 한 줄로 표시함', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /사용할 준비 루틴/ }).click();

  const options = ['기본 외출 준비', '빠른 준비', '여유있는 준비'];
  const boxes = await Promise.all(options.map((name) => page.getByRole('radio', { name, exact: true }).boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const top = boxes[0].y;
  for (const box of boxes) {
    expect(Math.abs(box.y - top), '준비 루틴 선택지가 같은 줄에 있어야 합니다').toBeLessThanOrEqual(1);
    expect(box.height, '준비 루틴의 터치 영역은 44px 이상이어야 합니다').toBeGreaterThanOrEqual(44);
  }
});

test('음성 일정은 이동수단 확인 전 확정할 수 없음', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=transport-missing');
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하고 일정 등록', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '이동수단 확인 필요 수정', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '이동수단 확인 필요 수정', exact: true }).click();
  await page.getByRole('radio', { name: '대중교통', exact: true }).click();
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '이동수단 대중교통 수정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하고 일정 등록', exact: true })).toBeEnabled();
});

test('음성 이동수단 질문의 세 선택지가 모두 보이고 터치 영역을 지킴', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=transport-missing');
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toBeVisible();

  const options = ['대중교통', '승용차(택시)', '도보'];
  const boxes = await Promise.all(options.map((name) => page.getByRole('button', { name, exact: true }).boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  for (const box of boxes) {
    expect(box.height, '이동수단 선택지의 터치 영역은 44px 이상이어야 합니다').toBeGreaterThanOrEqual(44);
  }
});

test('확정 계획 지도는 출발지에서 목적지까지 이동 경로를 표시함', async ({ page }) => {
  await page.route('**/mobility*', (route) => route.abort());
  await page.addInitScript((plan) => {
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [plan] }));
  }, {
    ...confirmedPlanFixture,
    schedule: { ...confirmedPlanFixture.schedule, destinationCoordinate: { latitude: 35.1595, longitude: 129.0606 } },
  });

  await page.goto('/plan?e2eRoute=ready');
  await page.getByRole('button', { name: '지도 보기', exact: true }).click();

  await expect(page.getByText('도착 장소와 이동 경로', { exact: true })).toBeVisible();
  const summary = page.getByText(/^이동 경로 · /);
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('예상 직선 경로');
  await expect(summary).toContainText('분');
});

test('말한 장소로 약속 이름을 짓고 빠진 항목만 되물음', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=missing-fields');
  // The place was spoken, so the name comes from it instead of costing another question.
  await expect(page.getByRole('button', { name: '일정명 강남 세브란스병원 약속 수정', exact: true })).toBeVisible();
  await expect(page.getByText('무슨 약속인가요?', { exact: true })).toHaveCount(0);

  await expect(page.getByText('언제 만나나요?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하고 일정 등록', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '내일', exact: true }).click();
  await expect(page.getByText('언제 만나나요?', { exact: true })).toHaveCount(0);
});

test('이동수단이 빠지면 다시 묻지 않고 예시 선택을 권함', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=transport-missing');
  // Repeating a word the microphone already missed rarely goes better, so the fixed list is open.
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toBeVisible();
  for (const option of ['대중교통', '승용차(택시)', '도보']) {
    await expect(page.getByRole('button', { name: option, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '확정하고 일정 등록', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: '승용차(택시)', exact: true }).click();
  await expect(page.getByRole('button', { name: '이동수단 승용차(택시) 수정', exact: true })).toBeVisible();
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toHaveCount(0);
});

test('음성 이동수단은 서버 왕복 없이 즉시 반영됨', async ({ page }) => {
  const assistantCalls = [];
  await page.route('**/assistant*', async (route) => {
    assistantCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto('/voice-schedule?e2eState=transport-missing');
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toBeVisible();

  const started = Date.now();
  await page.getByRole('button', { name: '대중교통', exact: true }).click();
  await expect(page.getByRole('button', { name: '이동수단 대중교통 수정', exact: true })).toBeVisible();
  const elapsed = Date.now() - started;

  expect(elapsed, '선택은 서버 응답을 기다리지 않고 즉시 반영돼야 합니다').toBeLessThan(1_000);
  expect(assistantCalls, '로컬에서 답할 수 있는 선택은 AI 비서를 부르지 않아야 합니다').toEqual([]);
  await expect(page.getByText('어떻게 이동할까요?', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('사용자 발화: 대중교통', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하고 일정 등록', exact: true })).toBeEnabled();
});

test('음성 정리 결과에 확인한 이동수단을 표시함', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=proposal');
  await expect(page.getByText('이렇게 등록할까요?', { exact: true })).toBeVisible();

  const transportRow = page.getByRole('button', { name: '이동수단 대중교통 수정', exact: true });
  await expect(transportRow).toBeVisible();
  const [timeBox, transportBox, destinationBox] = await Promise.all([
    page.getByRole('button', { name: '시간 15:00–16:00 수정', exact: true }).boundingBox(),
    transportRow.boundingBox(),
    page.getByRole('button', { name: '장소 강남 세브란스병원 수정', exact: true }).boundingBox(),
  ]);
  expect(transportBox.y, '이동수단은 시간 아래에 있어야 합니다').toBeGreaterThan(timeBox.y);
  expect(transportBox.y, '이동수단은 장소 위에 있어야 합니다').toBeLessThan(destinationBox.y);
  expect(transportBox.height, '이동수단 행의 터치 영역은 44px 이상이어야 합니다').toBeGreaterThanOrEqual(44);
});

test('음성 일정 버튼이 내비게이션 가운데에 반쯤 걸쳐 고정됨', async ({ page }) => {
  await page.goto('/');
  await page.getByText('오늘의 준비 계획', { exact: true }).waitFor({ state: 'visible' });
  const floatingAction = page.getByRole('button', { name: '음성으로 새 일정 만들기' });
  const homeTab = page.getByRole('tab', { name: '홈' });
  const settingsTab = page.getByRole('tab', { name: '설정' });
  const before = await floatingAction.boundingBox();
  const tab = await homeTab.boundingBox();
  const lastTab = await settingsTab.boundingBox();
  const viewport = page.viewportSize();

  expect(before).not.toBeNull();
  expect(tab).not.toBeNull();
  // Centred on the bar, and the bar's top edge runs through the middle of the button.
  expect(Math.abs(before.x + before.width / 2 - viewport.width / 2), '음성 일정 버튼은 가로 가운데에 있어야 합니다').toBeLessThanOrEqual(2);
  expect(before.x, '음성 일정 버튼은 홈 탭 오른쪽에 있어야 합니다').toBeGreaterThan(tab.x + tab.width);
  expect(before.x + before.width, '음성 일정 버튼은 설정 탭 왼쪽에 있어야 합니다').toBeLessThan(lastTab.x);
  const barTop = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const bar = tabs[0]?.parentElement;
    return bar ? bar.getBoundingClientRect().top : null;
  });
  expect(barTop).not.toBeNull();
  expect(Math.abs(before.y + before.height / 2 - barTop), '버튼의 절반이 내비게이션 바 위로 올라와야 합니다').toBeLessThanOrEqual(3);

  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight) element.scrollTop = element.scrollHeight;
    }
  });
  const after = await floatingAction.boundingBox();
  expect(after).not.toBeNull();
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('홈은 오늘·내일 캘린더 약속 카테고리를 표시하지 않음', async ({ page }) => {
  await page.goto('/?e2eCalendar=today');
  await expect(page.getByText('오늘의 준비 계획', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /날씨 상세 보기/ })).toHaveCount(0);
  await expect(page.getByText('재택근무', { exact: true })).toHaveCount(0);
  await expect(page.getByText('팀 점검 회의', { exact: true })).toHaveCount(0);
  await expect(page.getByText('저녁 약속', { exact: true })).toHaveCount(0);
  await expect(page.getByText('내일 오전 약속', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ 말로 추가', exact: true })).toHaveCount(0);
});

test('확정 약속이 없는 홈은 안내 상자 하나로 일정 생성에 진입함', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [] }));
  });
  await page.goto('/');
  const emptyBox = page.getByRole('button', { name: '확정된 다음 약속이 없어요. 새 일정 만들기', exact: true });
  await expect(emptyBox).toBeVisible();
  // 안내는 한 줄이고, 별도의 말로 만들기 버튼은 없다. 내비게이션의 음성 버튼이 그 역할을 한다.
  await expect(page.getByText('일정을 등록하면 준비 시작 시각에 자동으로 실행돼요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '말로 새 일정 만들기', exact: true })).toHaveCount(0);
  await emptyBox.click();
  await expect(page).toHaveURL(/\/create\?new=1$/);
  await expect(page.getByText('언제, 어디에서 만나나요?', { exact: true })).toBeVisible();
});

test('홈 일정 끝의 연속 정시 도착 배지에서 지난 일정으로 이동함', async ({ page }) => {
  await page.goto('/?e2eCalendar=today&e2eWeather=ready&e2eStreak=5');
  const badge = page.getByRole('button', { name: /연속 5회 정시 도착 중.*시간의 달인.*지난 일정 보기/ });
  await expect(badge).toBeVisible();
  await expect(badge.getByText("한 번만 더 하면 '시간의 달인' 뱃지야", { exact: true })).toBeVisible();
  await badge.click();
  await expect(page).toHaveURL(/\/schedules\?tab=past$/);
  await expect(page.getByText('지난 일정 화면입니다.', { exact: true })).toBeVisible();
});

test('홈 약속 상자는 준비 시작/약속 시간을 한 줄로 보여주고 상자·시작 버튼이 실시간 준비 화면을 엶', async ({ page }) => {
  await page.goto('/?e2eCalendar=today');
  // 제목 영역과 시간 줄 전체가 실시간 준비 화면으로 가는 손잡이다.
  const titleBox = page.getByRole('button', { name: '서면 볼링장 친구 약속, 실시간 준비 화면 열기', exact: true });
  await expect(titleBox).toBeVisible();
  const times = page.getByRole('button', { name: /^준비 시작 12:55.*약속 14:00/ });
  await expect(times).toBeVisible();
  await expect(times.getByText('/', { exact: false })).toBeVisible();

  const start = page.getByRole('button', { name: /^시작\./ });
  await expect(start).toBeVisible();
  const startBox = await start.boundingBox();
  expect(startBox.height, '시작 버튼의 터치 영역은 44px 이상이어야 합니다').toBeGreaterThanOrEqual(44);
  expect(Math.abs(startBox.width - startBox.height), '시작 버튼은 원형이어야 합니다').toBeLessThanOrEqual(1);

  // 연필이 준비 계획 상세로 가는 유일한 출구다.
  await page.getByRole('button', { name: '준비 계획 상세 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText('확정된 준비 계획', { exact: true })).toBeVisible();
  await page.goBack();

  await titleBox.click();
  await expect(page).toHaveURL(/\/progress/);
});
test('홈은 확정한 일정 중 오늘·내일 약속만 등록 목록으로 보여줌', async ({ page }) => {
  await page.addInitScript(({ firstPlan }) => {
    const secondPlan = {
      ...firstPlan,
      id: 'visual-confirmed-plan-2',
      schedule: { ...firstPlan.schedule, title: '저녁 식사 약속', appointmentTime: '18:30', destination: '광안리 식당' },
      plan: { ...firstPlan.plan, prepStart: '17:25', departure: '18:02', arrival: '18:26' },
      appointmentAt: firstPlan.appointmentAt + 4.5 * 60 * 60_000,
      prepStartAt: firstPlan.prepStartAt + 4.5 * 60 * 60_000,
      confirmedAt: firstPlan.confirmedAt + 1_000,
      state: 'scheduled',
    };
    const tomorrowPlan = {
      ...secondPlan,
      id: 'visual-confirmed-plan-tomorrow',
      schedule: { ...secondPlan.schedule, title: '내일 일정' },
      appointmentAt: firstPlan.appointmentAt + 24 * 60 * 60_000,
      prepStartAt: firstPlan.prepStartAt + 24 * 60 * 60_000,
    };
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [firstPlan, secondPlan, tomorrowPlan] }));
  }, { firstPlan: confirmedPlanFixture });
  await page.goto('/?e2eCalendar=today&e2eWeather=ready');
  const registeredHeading = page.getByText('오늘·내일 등록 약속 3개', { exact: true });
  await expect(registeredHeading).toBeVisible();
  await expect(page.getByRole('button', { name: /등록 일정, 서면 볼링장 친구 약속/ })).toBeVisible();
  await expect(page.getByText('내일 일정', { exact: true })).toBeVisible();
  await expect(page.getByText('내일', { exact: true })).toBeVisible();
  const dinner = page.getByRole('button', { name: /등록 일정, 저녁 식사 약속/ });
  await expect(dinner).toBeVisible();
  await expect(dinner.getByText('18:30', { exact: true })).toBeVisible();
  await expect(dinner.getByText('광안리 식당', { exact: true })).toBeVisible();
  await dinner.click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText('18:30 약속', { exact: true })).toBeVisible();
});

test('시간이 지난 일정은 완료 또는 미완료로 종결됨', async ({ page }) => {
  await page.addInitScript(({ firstPlan, now }) => {
    const elapsed = {
      ...firstPlan,
      id: 'elapsed-incomplete-plan',
      schedule: { ...firstPlan.schedule, title: '지나간 미완료 일정', appointmentTime: '11:00' },
      appointmentAt: now - 2 * 60 * 60_000,
      prepStartAt: now - 3 * 60 * 60_000,
      state: 'scheduled',
    };
    const completed = {
      ...elapsed,
      id: 'elapsed-completed-plan',
      schedule: { ...elapsed.schedule, title: '지나간 완료 일정', appointmentTime: '10:00' },
      appointmentAt: now - 3 * 60 * 60_000,
      state: 'completed',
    };
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [elapsed, completed, firstPlan] }));
  }, { firstPlan: confirmedPlanFixture, now: fixedNow.getTime() });

  await page.goto('/schedules');
  await page.getByRole('tab', { name: '지난 일정', exact: true }).click();
  await expect(page.getByText('지나간 미완료 일정', { exact: true })).toBeVisible();
  await expect(page.getByText('지나간 완료 일정', { exact: true })).toBeVisible();
  await expect(page.getByText('미완료', { exact: true })).toBeVisible();
  await expect(page.getByText('완료', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const plans = JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans')).plans;
    return plans.find((plan) => plan.id === 'elapsed-incomplete-plan')?.state;
  })).toBe('incomplete');
});

test('지난 일정 기록은 확인을 거쳐 삭제됨', async ({ page }) => {
  await page.addInitScript(({ firstPlan, now }) => {
    const elapsed = {
      ...firstPlan,
      id: 'elapsed-incomplete-plan',
      schedule: { ...firstPlan.schedule, title: '지나간 미완료 일정', appointmentTime: '11:00' },
      appointmentAt: now - 2 * 60 * 60_000,
      prepStartAt: now - 3 * 60 * 60_000,
      state: 'scheduled',
    };
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [elapsed, firstPlan] }));
  }, { firstPlan: confirmedPlanFixture, now: fixedNow.getTime() });

  await page.goto('/schedules?tab=past');
  await expect(page.getByText('지나간 미완료 일정', { exact: true })).toBeVisible();

  const remove = page.getByRole('button', { name: '지나간 미완료 일정 기록 삭제', exact: true });
  await remove.click();
  await expect(page.getByText('지나간 미완료 일정', { exact: true }), '확인 전에는 기록이 남아야 합니다').toBeVisible();

  await page.getByRole('button', { name: '삭제 취소', exact: true }).click();
  await expect(page.getByText('지나간 미완료 일정', { exact: true })).toBeVisible();

  await remove.click();
  const confirmColor = await page.getByRole('button', { name: '기록 삭제 확인', exact: true })
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(redShare(confirmColor), '기록 삭제 확인은 경고 색이어야 합니다').toBeGreaterThan(0.45);

  await page.getByRole('button', { name: '기록 삭제 확인', exact: true }).click();
  await expect(page.getByText('지나간 미완료 일정', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const plans = JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans')).plans;
    return plans.some((plan) => plan.id === 'elapsed-incomplete-plan');
  })).toBe(false);
});

test('알림의 날씨 카드는 내부 상세 화면으로 이동하고 출처는 상세에서만 보여줌', async ({ page }) => {
  await page.goto('/alerts?e2eWeather=ready');
  await expect(page.getByText('날씨 데이터: 기상청', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '부산진구 날씨 비, 27도. 날씨 상세 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/weather\?e2eWeather=ready$/);
  await expect(page.getByText('날씨 상세', { exact: true })).toBeVisible();
  await expect(page.getByText('체감', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '날씨 데이터 제공 기상청', exact: true })).toBeVisible();
});

test('알림의 날씨는 위치 권한과 네트워크 실패의 복구 행동을 제공함', async ({ page }) => {
  await page.goto('/alerts');
  await expect(page.getByText('현재 위치 날씨를 확인하세요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '위치 권한 설정', exact: true }).click();
  await expect(page).toHaveURL(/\/permissions\?focus=location$/);
  await expect(page.getByText('현재 위치', { exact: true })).toBeVisible();

  await page.goto('/alerts?e2eWeather=error');
  await expect(page.getByText('날씨를 불러오지 못했어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '날씨 다시 불러오기', exact: true })).toBeVisible();
});

test('알림은 아직 시작하지 않은 약속을 설명하고 해당 계획으로 이동함', async ({ page }) => {
  await page.addInitScript((plan) => {
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [plan] }));
  }, { ...confirmedPlanFixture, prepStartAt: fixedNow.getTime() + 30 * 60_000, appointmentAt: fixedNow.getTime() + 90 * 60_000 });
  await page.goto('/alerts');
  const alert = page.getByRole('button', { name: /준비 시작 알림/ });
  // The body quotes the confirmed plan rather than a fixed sample sentence.
  await expect(alert).toContainText('서면 볼링장 친구 약속');
  await expect(alert).toContainText('12:55에 준비를 시작해요');
  // Floored minutes, so the boundary lands on 29 or 30 depending on load time.
  await expect(alert).toContainText(/(29|30)분 뒤 시작/);
  await alert.click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText('확정된 준비 계획', { exact: true })).toBeVisible();
});

test('준비가 진행 중이면 진행 화면으로 보냄', async ({ page }) => {
  await page.goto('/alerts');
  const running = page.getByRole('button', { name: /준비 진행 중/ });
  await expect(running).toBeVisible();
  await running.click();
  await expect(page).toHaveURL(/\/progress$/);
});

test('등록된 약속이 없으면 알림을 지어내지 않음', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [] }));
  });
  await page.goto('/alerts');
  await expect(page.getByText('지금 확인할 알림이 없어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /준비 시작 알림/ })).toHaveCount(0);
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
    // 같은 날 다른 확정 약속이 있으면 하루 한 번 규칙이 샤워를 빼서 개인화 배너가 사라진다.
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [] }));
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
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();
  // 지표는 접힌 채로 시작한다. 펼치기 전에는 값이 화면에 없어야 한다.
  await expect(page.getByText('첫 일정 생성 완료율', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /제품 경험 측정/ }).click();
  await page.getByText('100%', { exact: true }).first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const metric = [...document.querySelectorAll('*')].find((element) => element.textContent === '첫 일정 생성 완료율');
    metric?.scrollIntoView({ block: 'start' });
  });
  await expectVisual(page, 'mvp-metrics');
});

test('plus-offer 화면', async ({ page }) => {
  await page.addInitScript((analytics) => {
    window.localStorage.setItem('@on-time/analytics', JSON.stringify(analytics));
  }, plusEligibleAnalyticsStore);
  await page.goto('/plus');
  await page.getByText('사전등록할 수 있어요', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'plus-offer');
});

test('Plus 관심은 명시적 선택 후 저장하고 확인 후 철회함', async ({ page }) => {
  await page.addInitScript((analytics) => {
    window.localStorage.setItem('@on-time/analytics', JSON.stringify(analytics));
  }, plusEligibleAnalyticsStore);
  await page.goto('/plus');
  await page.getByText('사전등록할 수 있어요', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('radio', { name: /학생 연간/ }).click();
  expect(await page.evaluate(() => window.localStorage.getItem('@on-time/plus-interest'))).toBeNull();
  await page.getByRole('button', { name: '이 플랜에 관심 있어요' }).click();
  await expect(page.getByText('관심 등록됨', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/plus-interest')).plan)).toBe('student-annual');
  await page.getByRole('button', { name: '관심 등록 철회' }).click();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/plus-interest')).plan)).toBe('student-annual');
  await page.getByRole('button', { name: '철회 확인' }).click();
  await expect(page.getByText('관심 등록됨', { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('@on-time/plus-interest'))).toBeNull();
});

test('Plus 저장 오류는 성공 처리하지 않고 다시 시도 상태를 유지함', async ({ page }) => {
  await page.addInitScript((analytics) => {
    window.localStorage.setItem('@on-time/analytics', JSON.stringify(analytics));
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === '@on-time/plus-interest') throw new Error('fixture storage failure');
      return originalSetItem.call(this, key, value);
    };
  }, plusEligibleAnalyticsStore);
  await page.goto('/plus');
  await page.getByText('사전등록할 수 있어요', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '이 플랜에 관심 있어요' }).click();
  await expect(page.getByText('관심 상태를 저장하지 못했어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '이 플랜에 관심 있어요' })).toBeEnabled();
  expect(await page.evaluate(() => window.localStorage.getItem('@on-time/plus-interest'))).toBeNull();
});

test('Plus 불러오기 오류는 기본 상태와 다시 불러오기 행동을 제공함', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === '@on-time/plus-interest') throw new Error('fixture load failure');
      return originalGetItem.call(this, key);
    };
  });
  await page.goto('/plus');
  await expect(page.getByText('관심 상태를 불러오지 못했어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await expect(page.getByText('일정 3회 더 완료해 주세요', { exact: true })).toBeVisible();
});

test('Plus 미리보기는 가격안과 함께 사용자 유형을 묻고, 전송 시점을 밝힘', async ({ page }) => {
  // 유형 질문은 Phase 0 화면이 아니라 이 화면에 있고, 집계는 화면을 닫을 때 전송된다.
  await page.addInitScript(({ analytics, interest }) => {
    window.localStorage.setItem('@on-time/analytics', JSON.stringify(analytics));
    window.localStorage.setItem('@on-time/plus-interest', JSON.stringify(interest));
  }, { analytics: plusEligibleAnalyticsStore, interest: plusInterestFixture });
  await page.goto('/plus');
  await page.getByRole('radio', { name: '직장인·프리랜서' }).click();
  await expect(page.getByRole('radio', { name: '직장인·프리랜서, 선택됨' })).toBeVisible();
  await expect(page.getByText('이 화면을 닫을 때 완료 횟수·정시 도착률 같은 집계값과 선택한 사용자 유형이 검증 통계로 전송돼요. 일정명·장소·위치·음성·연락처·기기 식별자·정확한 이벤트 시각은 포함하지 않습니다.', { exact: true })).toBeVisible();
});

test('온보딩 키보드 포커스와 실행', async ({ page }) => {
  await page.goto('/onboarding');
  const skip = page.getByRole('button', { name: '온보딩 건너뛰고 Google 로그인으로 이동' });
  const next = page.getByRole('button', { name: '다음' });

  await expect(skip).toHaveAttribute('tabindex', '0');
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(next).toHaveAttribute('tabindex', '0');
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByText('늦을 것 같으면\n바로 다시 짜드려요.', { exact: true })).toBeVisible();
});

test('캘린더 일정은 선택·확인 후 새 초안으로 가져옴', async ({ page }) => {
  await page.goto('/schedules?e2eCalendar=events');
  await page.getByRole('button', { name: /팀 주간 회의/ }).click();
  await expect(page.getByText('가져오기 전 미리보기', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/schedule-draft')).title)).toBe('친구와 볼링');
  await page.getByRole('button', { name: '이 일정 가져오기' }).click();
  await expect(page.getByText('캘린더에서 가져왔어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '일정 이름' })).toHaveValue('팀 주간 회의');
  // The imported day and clock land on the date row and the time drums.
  await expect(page.getByRole('button', { name: /^날짜 선택, 7월 28일 \(화\)/ })).toBeVisible();
  await expect(page.getByText(/^오전 10:00/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: '목적지', exact: true })).toHaveValue('서울시청 회의실');
});

test('계획 확정은 즉시 실행하지 않고 여러 약속을 저장함', async ({ page }) => {
  await page.goto('/create?new=1');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: 'AI 계획 만들기', exact: true }).click();

  await expect(page.getByText('준비 계획을 확인해 주세요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '이 계획으로 시작', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '계획 확정', exact: true }).click();

  await expect(page).toHaveURL(/\/schedules$/);
  await expect(page.getByText('서면 볼링장 친구 약속', { exact: true })).toBeVisible();
  await expect(page.getByText('목요일 오후 약속', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans')).plans.length)).toBe(2);
});

test('확정 계획은 준비 시작 시각 전에는 대기하고 시각이 되면 자동 시작함', async ({ page }) => {
  await page.addInitScript((plan) => {
    window.localStorage.removeItem('@on-time/progress-session');
    window.localStorage.setItem('@on-time/confirmed-plans', JSON.stringify({ version: 1, plans: [plan] }));
  }, {
    ...confirmedPlanFixture,
    id: 'future-auto-start-plan',
    plan: { ...confirmedPlanFixture.plan, prepStart: '13:01' },
    prepStartAt: fixedNow.getTime() + 60_000,
    appointmentAt: fixedNow.getTime() + 61 * 60_000,
    state: 'scheduled',
  });
  await page.goto('/schedules');
  await expect(page.getByText('13:01 자동 시작', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('@on-time/progress-session'))).toBeNull();

  await page.clock.fastForward(60_000);
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/progress-session') ?? 'null')?.confirmedPlanId)).toBe('future-auto-start-plan');
});

test('일정 등록에서 장소명 검색 결과를 선택하고 최근 장소로 다시 사용함', async ({ page }) => {
  await page.addInitScript((place) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).includes('/v1/places')
      ? Promise.resolve(new Response(JSON.stringify({ places: [place] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : originalFetch(input, init);
    const saved = JSON.parse(window.localStorage.getItem('@on-time/schedule-draft'));
    window.localStorage.setItem('@on-time/schedule-draft', JSON.stringify({ ...saved, step: 0 }));
  }, searchedPlace);
  await page.goto('/create');
  const destination = page.getByRole('textbox', { name: '목적지', exact: true });
  await destination.fill('서울시청');
  await page.getByRole('button', { name: '목적지 검색' }).click();
  await expect(page.getByText('1개의 장소를 찾았습니다.', { exact: true })).toBeVisible();
  await page.getByText(searchedPlace.name, { exact: true }).click();
  await expect(page.getByText('서울특별시청 목적지를 선택했습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '저장된 장소 서울특별시청 선택' })).toBeVisible();
  // Saved places are keyed per signed-in account, so the storage key carries the user id suffix.
  const persisted = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((item) => item.startsWith('@on-time/saved-places'));
    return key ? JSON.parse(window.localStorage.getItem(key)) : null;
  });
  expect(persisted[0]).toEqual(expect.objectContaining({ name: searchedPlace.name, coordinate: searchedPlace.coordinate }));
  await destination.fill('다른 장소');
  await page.getByRole('button', { name: '저장된 장소 서울특별시청 선택' }).click();
  await expect(destination).toHaveValue('서울특별시청');
});

test('음성 일정 결과를 한 번에 확정하고 추출 값만 직접 수정할 수 있음', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=proposal');
  await expect(page.getByText('일정명', { exact: true })).toBeVisible();
  await expect(page.getByText('날짜', { exact: true })).toBeVisible();
  await expect(page.getByText('시간', { exact: true })).toBeVisible();
  await expect(page.getByText('장소', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /시간 15:00–16:00 수정/ }).click();
  const timeInput = page.getByRole('textbox', { name: '시간 직접 수정' });
  await timeInput.fill('16:00');
  await timeInput.press('Enter');
  await expect(page.getByText('16:00–17:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '확정하고 일정 등록' }).click();
  await expect(page).toHaveURL(/\/plan/);
  const savedAppointment = page.getByRole('button', { name: '약속이 저장됐습니다. 홈으로 이동', exact: true });
  await expect(savedAppointment).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('@on-time/confirmed-plans') ?? '{"plans":[]}').plans.find((plan) => plan.schedule.title === '병원')?.schedule.appointmentTime)).toBe('16:00');
  await savedAppointment.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true })).toBeVisible();
});

test('말로 일정 생성 X는 이전 화면 기록이 없어도 홈으로 닫힘', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=proposal');
  await page.getByRole('button', { name: '음성 입력 닫기', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true })).toBeVisible();
});

test('모호한 시간은 해당 항목의 빠른 선택지만 보여줌', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=clarification');
  await expect(page.getByText('금요일 오후 몇 시로 등록할까요?', { exact: true })).toBeVisible();
  for (const option of ['13:00', '15:00', '17:00', '직접 입력']) {
    await expect(page.getByRole('button', { name: option, exact: true })).toBeVisible();
  }
  await expect(page.getByText('확인할 항목: 시간 · 지도 위치', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하고 일정 등록' })).toBeDisabled();
});

test('음성 일정 화면은 열리자마자 AI 비서 자동 듣기 상태를 보여줌', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=auto-listening');
  await expect(page.getByLabel('AI 실시간 대화 자동 듣기 켜짐', { exact: true })).toBeVisible();
  await expect(page.getByText('듣는 중', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '말을 마쳤어요', exact: true }), '발화 종료는 자동 감지하므로 수동 종료 버튼이 없어야 합니다').toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'AI 음성 출력 끄기', exact: true })).toBeVisible();
  await expect(page.getByLabel(/^사용자 발화:/)).toHaveCount(0);
  await expect(page.getByText('마이크를 누르고 대답해 줘', { exact: true })).toHaveCount(0);
});

test('플로팅 스피커로 AI 음성 출력만 끄고 다시 켬', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=auto-listening');
  await page.getByRole('switch', { name: 'AI 음성 출력 끄기', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'AI 음성 출력 켜기', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'AI 음성 출력 켜기', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'AI 음성 출력 끄기', exact: true })).toBeVisible();
});

test('음성 할 일을 작은 행동으로 수정·저장하고 5분만 시작함', async ({ page }) => {
  await page.goto('/voice-schedule?e2eState=task');
  await expect(page.getByText('지금 시작할 만큼 나눴어요', { exact: true })).toBeVisible();
  const firstAction = page.getByLabel('1번째 행동 수정');
  await firstAction.fill('빈 문서 열기');
  await page.getByRole('button', { name: '저장하고 5분만 시작' }).click();
  await expect(page.getByText('지금–다음–나중', { exact: true })).toBeVisible();
  await expect(page.getByText('빈 문서 열기', { exact: true })).toBeVisible();
  await expect(page.getByText('5분 시작 중', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('@time-agent/execution-tasks') ?? '{}'));
  expect(stored.tasks[0].status).toBe('active');
});

test('설정한 다크 모드를 음성 일정 화면에 저장·적용함', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('설정이 저장됐습니다', { exact: true })).toBeVisible();
  // 한 번 누르면 바로 바뀐다. 목록을 여는 단계는 없다.
  await page.getByRole('switch', { name: '다크 모드', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('@on-time/app-settings') ?? '{}').colorMode === 'dark');
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await page.getByRole('button', { name: '음성으로 새 일정 만들기', exact: true }).click();
  const firstQuestion = page.getByText(/새 일정이나 할 일을 말해 주세요/);
  await expect(firstQuestion).toBeVisible();
  await expect(firstQuestion).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expectVisual(page, 'voice-schedule-dark');
});

test('같은 날 두 번째 약속은 샤워·화장을 빼고 첫 일정에 맡김', async ({ page }) => {
  // The fixture already holds a 14:00 appointment today; a 16:00 draft is the second of the day.
  await page.addInitScript(() => {
    const saved = JSON.parse(window.localStorage.getItem('@on-time/schedule-draft'));
    window.localStorage.setItem('@on-time/schedule-draft', JSON.stringify({ ...saved, step: 1, appointmentTime: '16:00' }));
  });
  await page.goto('/create');
  await page.getByText('어떻게 이동할까요?', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('오늘 두 번째 약속이에요', { exact: true })).toBeVisible();
  await expect(page.getByText('오늘 14:00 서면 볼링장 친구 약속 준비에 샤워·화장이 이미 있어 이번 계획에서는 뺐어요.', { exact: true })).toBeVisible();
  await expect(page.getByText('샤워', { exact: true })).toBeHidden();
  await expect(page.getByText('옷 입기', { exact: true })).toBeVisible();
  await expectVisual(page, 'create-second-of-day');

  await page.getByRole('button', { name: '샤워 다시 넣기', exact: true }).click();
  await expect(page.getByText('샤워', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '샤워 다시 넣기', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: '화장 다시 넣기', exact: true })).toBeVisible();
});

test('목적지 선택 화면은 좁은 화면에서도 가로 잘림이 없음', async ({ page }) => {
  await page.addInitScript(() => {
    const saved = JSON.parse(window.localStorage.getItem('@on-time/schedule-draft'));
    window.localStorage.setItem('@on-time/schedule-draft', JSON.stringify({ ...saved, step: 0 }));
  });
  await page.goto('/create');
  await page.getByText('목적지 찾기', { exact: true }).waitFor({ state: 'visible' });
  await expectVisual(page, 'create-destination');
});
