import { defineConfig, devices } from '@playwright/test';

const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

export default defineConfig({
  testDir: './e2e/visual',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
    },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:19006',
    colorScheme: 'light',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'reduce',
  },
  projects: viewports.map(({ name, width, height }) => ({
    name,
    use: { viewport: { width, height } },
  })),
  webServer: {
    command: 'CI=1 npx expo start --web --port 19006',
    url: 'http://127.0.0.1:19006',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
