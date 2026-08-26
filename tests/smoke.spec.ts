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

test('T5 표적 오버레이 — 70m 밖은 녹색 지시, 안쪽은 황색 락온', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  /** 도로 위 트럭(초기 z=-220)에서 +z 로 `gap` 미터 뒤에 서서 -z 를 본다. */
  const lookAtTruck = async (gap: number) => {
    await page.evaluate((g) => {
      const t = window.__debug.flight.telemetry();
      t.pos.set(120, 14, -220 + g);
      t.vel.set(0, 0, 0);
      t.yaw = 0;
    }, gap);
    await page.evaluate(async () => {
      const n = window.__debug.frame + 3;
      while (window.__debug.frame < n) await new Promise((r) => requestAnimationFrame(r));
    });
    return page.evaluate(() => ({
      diamonds: document.querySelectorAll('.target-overlay polygon').length,
      locks: document.querySelectorAll('.target-overlay rect').length,
      labels: [...document.querySelectorAll('.target-overlay text')].map((t) => t.textContent ?? ''),
    }));
  };

  const far = await lookAtTruck(140);
  expect(far.diamonds, '원거리 표적에 다이아 마커가 없다').toBeGreaterThan(0);
  expect(far.locks, '70m 밖인데 락온 박스가 떴다').toBe(0);
  expect(far.labels.some((l) => /TRUCK \d+M/.test(l)), '거리 라벨이 없다').toBe(true);

  const near = await lookAtTruck(42);
  expect(near.locks, '70m 안인데 락온 박스가 없다').toBeGreaterThan(0);
  expect(near.labels).toContain('LOCK');

  await page.screenshot({ path: 'tests/__screenshots__/t5-hud-lock.png' });
});

test('T5 HUD — 06 문서 규격대로 코너에 흩어진다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });

  // 점선 십자·수평 가이드가 SVG 로 그려진다 (06 문서 원칙 ①)
  const dashed = await page.locator('.hud-reticle line[stroke-dasharray]').count();
  expect(dashed, '점선 수평 가이드가 없다').toBeGreaterThan(0);
  const solid = await page.locator('.hud-reticle line:not([stroke-dasharray])').count();
  expect(solid, '중앙 십자 4조각이 없다').toBe(4);

  // 텍스트가 네 코너 + 우중하에 흩어져 있다 (원칙 ②)
  for (const cell of ['status', 'link', 'alt', 'callsign', 'build']) {
    await expect(page.locator(`[data-c="${cell}"]`)).not.toBeEmpty();
  }
  await expect(page.locator('[data-c="status"]')).toContainText('READY');
  await expect(page.locator('[data-c="alt"]')).toContainText('ALT');
  await expect(page.locator('[data-c="alt"]')).toContainText('km/h');
  // 아케이드는 목표 고도(SET)를 보여 준다
  await expect(page.locator('[data-c="alt"]')).toContainText('SET');

  // 배경판·테두리 상자 없음 (원칙 ③) — 외곽선만으로 가독성을 낸다
  const style = await page.locator('[data-c="status"]').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderStyle, shadow: cs.textShadow };
  });
  expect(style.bg).toBe('rgba(0, 0, 0, 0)');
  expect(style.border).toBe('none');
  expect(style.shadow).not.toBe('none');
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

/**
 * T6 완료 조건: 카메라 모드 3종이 실제로 돌고, 열화상에서 하늘·물이 어둡고
 * 엔진부가 백열로 뜬다. 스크린샷 3장은 **눈으로 확인해야 한다** (CLAUDE.md 검증).
 */
test('T6 카메라 모드 — BW → COLOR → THRM 순환과 스크린샷 3장', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 트럭 앞 42m — 열원(엔진 0.98)이 화면에 있어야 4단 구조를 눈으로 볼 수 있다.
  await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    t.pos.set(120, 14, -178);
    t.vel.set(0, 0, 0);
    t.yaw = 0;
    const n = window.__debug.frame + 3;
    while (window.__debug.frame < n) await new Promise((r) => requestAnimationFrame(r));
  });

  const hud = page.locator('#hud');
  for (const [mode, label] of [
    ['bw', 'BW'],
    ['color', 'COLOR'],
    ['thermal', 'THRM'],
  ] as const) {
    await page.evaluate((m) => window.__debug.flight.setCamMode(m), mode);
    // 모드 표기가 HUD 에 실제로 반영되는지 — 상태만 바뀌고 화면이 그대로면 여기서 걸린다.
    await expect(hud).toContainText(label, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__debug.flight.camMode())).toBe(mode);
    await page.screenshot({ path: `tests/__screenshots__/t6-${mode}.png` });
  }

  // 버튼 한 번 = 한 칸 순환 (thermal → bw 로 돌아온다)
  await page.locator('.hud-btn[data-c="cam"]').click();
  expect(await page.evaluate(() => window.__debug.flight.camMode())).toBe('bw');
});
