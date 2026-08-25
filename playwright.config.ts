import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 컨테이너 이미지에 크로미움이 미리 깔려 있는 환경(PLAYWRIGHT_BROWSERS_PATH)에서는
 * 그 바이너리를 그대로 쓴다. 로컬 맥에서는 이 경로가 없어 Playwright 기본 경로로 떨어진다.
 */
function preinstalledChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const linked = join(root, 'chromium');
    if (existsSync(linked)) return linked;
  }
  return undefined;
}

const executablePath = preinstalledChromium();

/**
 * 브라우저 검증 루프 (02 문서 3.2).
 * 스크린샷은 tests/__screenshots__ 에 남겨 세션 간 눈으로 확인한다.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // 1차 타깃은 모바일 웹이다. 데스크톱은 T4 입력 작업에서 추가한다.
      name: 'phone',
      use: {
        ...devices['Pixel 7'],
        isMobile: true,
        hasTouch: true,
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
