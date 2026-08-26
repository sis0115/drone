import { expect, test } from '@playwright/test';
import { BUDGET } from '../src/data/render';

// 사이트 루트(`/`) = 코드베이스. 프로토타입 기준선은 /prototype.html.

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

  await page.goto('/');

  // 부트 연출(0.6초)이 끝나면 __debug.ready 가 선다.
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  const state = await page.evaluate(() => window.__debug.state);
  expect(state.screen).toBe('flight');

  await page.screenshot({ path: 'tests/__screenshots__/t1-boot.png' });

  expect(consoleErrors, `콘솔 에러:\n${consoleErrors.join('\n')}`).toEqual([]);
  expect(await page.evaluate(() => window.__debug.errors)).toEqual([]);
});

test('T2 씬이 실제로 그려진다 — 드로우콜·삼각형 예산', async ({ page }) => {
  await page.goto('/');
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

test('T3 비행이 실제로 배선되어 있다 — 입력이 기체를 움직인다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });

  // 바람을 끄고 재현 가능한 조건으로 만든다.
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  const start = await page.evaluate(() => window.__debug.drone.pos);

  // 사람과 같은 경로(InputSource)로 전진 입력을 넣는다.
  await page.evaluate(() => window.__debug.setInput(() => ({ pitch: 1 })));
  // 이 컨테이너는 프레임이 느리다 — 시간이 아니라 **프레임 수**로 기다린다.
  await page.evaluate(async () => {
    const target = window.__debug.frame + 8;
    while (window.__debug.frame < target) await new Promise((r) => requestAnimationFrame(r));
  });

  const after = await page.evaluate(() => ({
    pos: window.__debug.drone.pos,
    spd: window.__debug.drone.spd,
    battery: window.__debug.flight.battery(),
    crashed: window.__debug.flight.crashed(),
  }));

  const moved = Math.hypot(after.pos[0] - start[0], after.pos[2] - start[2]);
  expect(moved, '전진 입력에도 기체가 움직이지 않았다').toBeGreaterThan(1);
  expect(after.spd).toBeGreaterThan(1);
  expect(after.battery).toBeLessThan(100); // 배터리가 닳는다
  expect(after.crashed).toBeNull();
});

test('T4 가상 패드가 실제로 기체를 움직인다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 패드가 화면에 있다 — 없으면 폰에서 조작 자체가 불가능하다.
  await expect(page.locator('.stick[data-side="left"]')).toBeVisible();
  await expect(page.locator('.stick[data-side="right"]')).toBeVisible();

  const start = await page.evaluate(() => window.__debug.drone.pos);

  // 오른쪽 스틱을 위로 민다 = 전진 (Mode 2). 사람이 하는 것과 같은 경로.
  const box = (await page.locator('.stick[data-side="right"]').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 60, { steps: 4 });

  const axis = await page.evaluate(() => window.__debug.state.input as { pitch: number });
  expect(axis.pitch, '패드를 밀었는데 입력 축이 서지 않았다').toBeGreaterThan(0.5);

  await page.evaluate(async () => {
    const target = window.__debug.frame + 8;
    while (window.__debug.frame < target) await new Promise((r) => requestAnimationFrame(r));
  });
  await page.mouse.up();

  const after = await page.evaluate(() => window.__debug.drone.pos);
  const moved = Math.hypot(after[0] - start[0], after[2] - start[2]);
  expect(moved, '패드 입력이 비행으로 이어지지 않았다').toBeGreaterThan(1);

  await page.screenshot({ path: 'tests/__screenshots__/t4-pads.png' });
});

test('스틱을 놓으면 입력이 중립으로 돌아간다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });

  const box = (await page.locator('.stick[data-side="right"]').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 60, { steps: 3 });
  await page.mouse.up();

  await page.waitForFunction(
    () => Math.abs((window.__debug.state.input as { pitch: number }).pitch) < 0.01,
    null,
    { timeout: 10_000 },
  );
});

test('비행 모드 전환이 기체를 순간이동시키지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });

  const result = await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
    const before = { ...window.__debug.flight.telemetry().pos };
    window.__debug.flight.setMode('pro');
    const after = { ...window.__debug.flight.telemetry().pos };
    return { mode: window.__debug.flight.mode(), before, after };
  });

  expect(result.mode).toBe('pro');
  expect(result.after.x).toBeCloseTo(result.before.x, 3);
  expect(result.after.z).toBeCloseTo(result.before.z, 3);
});

test('__debug 훅 규격 — 좌표·속도·fps·렌더 정보 노출', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 10_000 });

  const build = await page.evaluate(() => window.__debug.build);
  // define 주입이 실패하면 문자열이 통째로 비거나 'dev' 로 떨어진다.
  expect(build.id).toMatch(/^[0-9a-f]{7}$|^dev$/);
  expect(build.branch).not.toBe('');

  // 폰에서 눈으로 확인하는 경로도 같이 막아 둔다.
  await expect(page.locator('.hud-br')).toContainText(build.id);
});

test('스크립트 입력이 사람 입력과 같은 자리에 꽂힌다', async ({ page }) => {
  await page.goto('/');
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
