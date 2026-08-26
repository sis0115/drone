import type { Page } from '@playwright/test';

/**
 * 부팅 → 작전실 → 출격 → 링크 → 비행. **사람과 같은 경로다** —
 * T9 에서 부팅 화면이 작전실(loadout)이 되면서 모든 브라우저 테스트의
 * 진입이 이 헬퍼를 지난다. 출격 버튼을 건너뛰는 뒷문을 만들지 않는다
 * (스크립트 입력이 사람과 같은 자리에 꽂히는 것과 같은 원칙).
 */
export async function enterFlight(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.lo-sortie').click();
  // 브리핑 — 한 번 탭해 타이핑을 스킵하고 링크 수립
  await page.locator('.br-panel').click();
  await page.locator('.br-launch').click();
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 120_000 });
}
