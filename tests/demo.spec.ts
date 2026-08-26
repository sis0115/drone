import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * 프로토타입 v0.7 은 `/prototype.html` 에 기준선으로 남는다 (사이트 루트는 코드베이스).
 * 07 문서상 `prototype/signal_lost_fpv.html` 은 기준선이라 수정 금지이므로,
 * 배포본이 원본과 **바이트 단위로 동일한지**를 여기서 못박는다.
 */
test('/prototype.html 이 원본 그대로 서빙된다', async ({ request }) => {
  const res = await request.get('/prototype.html');
  expect(res.status()).toBe(200);

  const served = await res.text();
  const original = readFileSync('prototype/signal_lost_fpv.html', 'utf8');
  expect(served).toBe(original);
});

test('프로토타입 기준선이 여전히 부팅한다', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.goto('/prototype.html');
  await expect(page).toHaveTitle(/SIGNAL LOST/i);

  // 데모는 CDN 에서 three r128 을 받는다. 네트워크가 막힌 환경에서는
  // 씬이 뜨지 않으므로, 여기서는 문서 구조와 진입 버튼까지만 확인한다.
  await expect(page.locator('#go')).toBeVisible();
  expect(consoleErrors.filter((e) => !/three|THREE|Script error/i.test(e))).toEqual([]);
});
