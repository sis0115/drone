import { expect, test } from '@playwright/test';
import { BUDGET } from '../src/data/render';

// 사이트 루트(`/`)는 프로토타입 데모다. 코드베이스 스캐폴딩은 /app.html 에 있다.

/**
 * T1 완료 조건: 빈 화면이 뜨고, __debug 훅이 살아 있고, 콘솔 에러가 0이며,
 * 스크린샷 1장이 남는다.
 */
test('부팅 → 링크 접속 → 스크린샷', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/app.html');

  // 부트 연출(0.6초)이 끝나면 __debug.ready 가 선다.
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  const state = await page.evaluate(() => window.__debug.state);
  expect(state.screen).toBe('ingame');

  await page.screenshot({ path: 'tests/__screenshots__/t1-boot.png' });

  expect(consoleErrors, `콘솔 에러:\n${consoleErrors.join('\n')}`).toEqual([]);
  expect(await page.evaluate(() => window.__debug.errors)).toEqual([]);
});

test('T2 씬이 실제로 그려진다 — 드로우콜·삼각형 예산', async ({ page }) => {
  await page.goto('/app.html');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 30_000 });
  // 씬 패스가 최소 한 번 돌 때까지
  await page.waitForFunction(() => window.__debug.render.calls > 0, null, { timeout: 30_000 });

  const render = await page.evaluate(() => window.__debug.render);
  // 프러스텀 컬링이 걸리므로 헤드리스 씬 검사(62)보다 작게 나온다.
  expect(render.calls, '드로우콜 예산 초과').toBeLessThan(BUDGET.drawCalls);
  // 지형·식생·소품이 실제로 그려지고 있는지 — 빈 화면이면 여기서 걸린다.
  expect(render.triangles, '씬이 비어 있다').toBeGreaterThan(50_000);

  await page.screenshot({ path: 'tests/__screenshots__/t2-world.png' });
});

test('__debug 훅 규격 — 좌표·속도·fps·렌더 정보 노출', async ({ page }) => {
  await page.goto('/app.html');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  // 이 컨테이너는 소프트웨어 렌더라 1fps 미만이 나온다. fps 값이 아니라
  // **프레임이 진행하는지**로 판정한다 (fps 는 0.5초 창 평균이라 0 으로 찍힐 수 있다).
  await page.waitForFunction(() => window.__debug.frame > 2, null, { timeout: 30_000 });

  const snap = await page.evaluate(() => ({
    fps: window.__debug.fps,
    frame: window.__debug.frame,
    drone: window.__debug.drone,
    render: window.__debug.render,
    hasSetInput: typeof window.__debug.setInput === 'function',
  }));

  expect(snap.hasSetInput).toBe(true);
  expect(snap.frame).toBeGreaterThan(2);
  expect(snap.drone.pos).toHaveLength(3);
  expect(snap.render.calls).toBeGreaterThan(0);
});

test('빌드 스탬프가 화면과 __debug 양쪽에 찍힌다', async ({ page }) => {
  await page.goto('/app.html');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  const build = await page.evaluate(() => window.__debug.build);
  // define 주입이 실패하면 문자열이 통째로 비거나 'dev' 로 떨어진다.
  expect(build.id).toMatch(/^[0-9a-f]{7}$|^dev$/);
  expect(build.branch).not.toBe('');

  // 폰에서 눈으로 확인하는 경로도 같이 막아 둔다.
  await expect(page.locator('.hud-br')).toContainText(build.id);
});

test('스크립트 입력이 사람 입력과 같은 자리에 꽂힌다', async ({ page }) => {
  await page.goto('/app.html');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  await page.evaluate(() => {
    window.__debug.setInput(() => ({ pitch: 1, yaw: -0.5 }));
  });

  await page.waitForFunction(
    () => (window.__debug.state.input as { pitch: number }).pitch === 1,
    null,
    { timeout: 5_000 },
  );

  const input = await page.evaluate(() => window.__debug.state.input);
  expect(input).toMatchObject({ pitch: 1, yaw: -0.5, roll: 0, throttle: 0, fire: false });
});
