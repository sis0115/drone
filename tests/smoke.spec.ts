import { expect, test } from '@playwright/test';
import { enterFlight } from './enterFlight';
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

  // T9 이후 첫 화면은 작전실이다 — 출격 버튼이 있어야 게임에 들어갈 수 있다
  await expect(page.locator('#loadout .lo-sortie')).toBeVisible();
  await page.screenshot({ path: 'tests/__screenshots__/t9-loadout.png' });
  await page.locator('.lo-sortie').click();

  // 링크 연출(0.6초)이 끝나면 __debug.ready 가 선다.
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 120_000 });

  const state = await page.evaluate(() => window.__debug.state);
  expect(state.screen).toBe('flight');

  await page.screenshot({ path: 'tests/__screenshots__/t1-boot.png' });

  expect(consoleErrors, `콘솔 에러:\n${consoleErrors.join('\n')}`).toEqual([]);
  expect(await page.evaluate(() => window.__debug.errors)).toEqual([]);
});

test('T2 씬이 실제로 그려진다 — 드로우콜·삼각형 예산', async ({ page }) => {
  await enterFlight(page);
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
  await enterFlight(page);

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
  await enterFlight(page);
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
  await enterFlight(page);

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
  await enterFlight(page);

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
  await enterFlight(page);
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
  await enterFlight(page);

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
  await enterFlight(page);

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
  await enterFlight(page);

  const build = await page.evaluate(() => window.__debug.build);
  // define 주입이 실패하면 문자열이 통째로 비거나 'dev' 로 떨어진다.
  expect(build.id).toMatch(/^[0-9a-f]{7}$|^dev$/);
  expect(build.branch).not.toBe('');

  // 폰에서 눈으로 확인하는 경로도 같이 막아 둔다.
  await expect(page.locator('.hud-br')).toContainText(build.id);
});

test('스크립트 입력이 사람 입력과 같은 자리에 꽂힌다', async ({ page }) => {
  await enterFlight(page);

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
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 3번 트럭 앞 — 열원(엔진 0.98)이 화면에 있어야 4단 구조를 눈으로 볼 수 있다.
  // ⚠️ 위협 사선 밖이어야 한다: T7 이후 (120,-178)은 A1 위험 반경 안이라
  // 모드 순환 도중 격추 → 디브리핑 전환(T8c) → HUD 소멸로 테스트가 죽는다.
  await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    t.pos.set(122, 14, -346);
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

/**
 * T7 완료 조건: 위협이 미션 코드가 아니라 `mission/threats` 에만 있고,
 * **모든 위협이 피격 0.5초 전 예고를 낸다** (GDD 4.5 규칙 1).
 * 계약 자체는 `tests/threats.spec.ts` 가 헤드리스로 강제한다. 여기서는
 * 그 계약이 **실제 화면까지 배선되어 있는지**를 본다.
 */
test('T7 위협 — 조준 예고가 화면에 먼저 뜨고, 그 뒤에 격추된다', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // A1 은 (104, -150). 위험 반경(50m) 밖 · 탐지 반경(95m) 안에 먼저 선다.
  await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    t.pos.set(104, t.pos.y, -80);
    t.vel.set(0, 0, 0);
    t.yaw = 0;
    const n = window.__debug.frame + 3;
    while (window.__debug.frame < n) await new Promise((r) => requestAnimationFrame(r));
  });

  // 이 지점은 B1 재밍 돔 안이기도 하다 — HUD 한 줄은 더 급한 쪽을 고르므로 목록을 본다.
  const outer = await page.evaluate(() => window.__debug.flight.threats());
  const a1 = outer.warnings.find((w) => w.id === 'A1');
  expect(a1, '탐지 반경 안인데 아무 표시가 없다').toBeTruthy();
  expect(a1!.kind, '위험 반경 밖인데 조준이 걸렸다').toBe('watch');

  // 위험 반경 안으로 들어가 조준 예고가 뜬 상태를 남긴다 — 화면에 안 보이면 예고가 없는 것이다.
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(104, t.pos.y + (14 - t.agl), -128);
      t.vel.set(0, 0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  expect(
    await page.locator('.threat-overlay polygon').count(),
    '조준 중인데 화면에 마커가 없다',
  ).toBeGreaterThan(0);
  await page.screenshot({ path: 'tests/__screenshots__/t7-telegraph.png' });

  // 스크린샷은 이 컨테이너에서 수 초가 걸린다(소프트 렌더). 그동안 조준이 끝나 버리므로
  // 계약 측정은 **깨끗한 상태에서 다시** 한다.
  await page.evaluate(() => window.__debug.flight.respawn());

  /**
   * 매 프레임 예고를 기록한다.
   * 컨테이너 fps 가 ~1 이라 "몇 프레임 뒤"로는 계약을 잴 수 없다 — **예고 누적 시간**을 본다.
   */
  const log = await page.evaluate(async () => {
    const samples: { kind: string; elapsed: number; armed: boolean }[] = [];
    const deadline = window.__debug.frame + 300;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(104, t.pos.y + (14 - t.agl), -128); // 반경 안 · 노출 고도 유지
      t.vel.set(0, 0, 0);
      await new Promise((r) => requestAnimationFrame(r));
      const w = window.__debug.flight.threats().warnings.find((x) => x.id === 'A1');
      if (w) samples.push({ kind: w.kind, elapsed: w.elapsed, armed: w.armed });
    }
    return {
      samples,
      crashed: window.__debug.flight.crashed(),
      violations: window.__debug.flight.threats().violations,
    };
  });

  expect(log.crashed, '조준이 끝났는데 격추되지 않았다').toBe('피격');
  expect(log.violations, `예고 계약 위반:\n${log.violations.join('\n')}`).toEqual([]);

  const aims = log.samples.filter((s) => s.kind === 'aim');
  expect(aims.length, '조준 예고가 한 프레임도 안 떴다').toBeGreaterThan(0);
  // ① 예고가 먼저 뜬다 — 계약 성립 전 프레임이 존재해야 한다
  expect(aims.some((s) => !s.armed), '들어서자마자 격추 가능 상태였다 — 예고 시간이 없다').toBe(true);
  // ② 격추 시점의 예고 누적 시간이 계약을 넘는다
  const last = aims[aims.length - 1];
  expect(last.elapsed, `격추 직전 예고가 ${last.elapsed.toFixed(2)}초뿐이다`).toBeGreaterThanOrEqual(0.5);
  await page.screenshot({ path: 'tests/__screenshots__/t7-hit.png' });
});

test('T7 위협 — B1 재밍 돔이 실제로 신호를 깎는다', async ({ page }) => {
  await enterFlight(page);

  const settle = async (x: number, z: number) => {
    await page.evaluate(
      async ([px, pz]) => {
        window.__debug.flight.setWindCalm();
        window.__debug.flight.respawn();
        const t = window.__debug.flight.telemetry();
        // 200m 상공 — 신호에는 거리·LOS 차폐·재밍 셋이 섞인다. 높이 띄워 차폐를 지워야
        // 두 지점의 차이가 **재밍 기여분**만 남는다.
        t.pos.set(px, t.pos.y + 200, pz);
        t.vel.set(0, 0, 0);
        // 신호는 평활화되므로 여러 프레임 굴려야 값이 자리 잡는다
        const n = window.__debug.frame + 25;
        while (window.__debug.frame < n) {
          window.__debug.flight.telemetry().vel.set(0, 0, 0);
          await new Promise((r) => requestAnimationFrame(r));
        }
      },
      [x, z] as const,
    );
    return page.evaluate(() => ({
      jam: window.__debug.flight.threats().jam,
      signal: Number(window.__debug.state.signalQuality),
    }));
  };

  // B1 은 (100, -195), 반경 135m. 코어 안 vs 밖을 비교한다.
  // 조종소(원점)에서 **같은 거리**인 두 점을 고른다. 멀리 나가 비교하면
  // 거리 감쇠가 섞여서 재밍 기여분을 못 본다.
  const inside = await settle(100, -195);
  const outside = await settle(-100, 195);

  expect(inside.jam, '돔 코어인데 재밍이 안 걸린다').toBeGreaterThan(0.9);
  expect(outside.jam, '돔 밖인데 재밍이 걸린다').toBe(0);
  expect(outside.signal, '차폐가 남아 있다 — 비교 조건이 성립하지 않는다').toBeGreaterThan(0.9);
  expect(inside.signal, '재밍이 신호를 깎지 않는다 — 배선이 끊겼다').toBeLessThan(outside.signal - 0.2);
});

/**
 * 점검 스윕에서 나온 결함: 원거리 표적이 소실점 근처에 몰리면 라벨이 한 줄에 포개져
 * "TRUCKTRUCKTRUCK 222M" 로 읽혔다. 고정 오프셋으로 라벨을 찍은 탓이다.
 */
test('표적·위협 라벨이 서로 겹치지 않는다', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(async () => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
    // 트럭 3대 + A1 존재 + B1 재밍이 전부 소실점 근처에 몰리는 시점.
    // 점검 스윕에서 라벨이 뭉갠 자리가 정확히 여기다(sweep-11).
    for (let i = 0; i < 4; i++) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(104, t.pos.y + (16 - t.agl), -80);
      t.vel.set(0, 0, 0);
      t.yaw = 0;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });

  /**
   * **한 번의 evaluate 안에서** 조회와 측정을 끝낸다.
   * 오버레이는 매 프레임 `innerHTML = ''` 로 통째로 갈아 끼운다. locator 로 노드를 잡아
   * 두고 나중에 재면 그 사이 한 프레임이 지나 노드가 떨어져 나가고, 떨어진 SVG 노드는
   * 크기를 전부 0 으로 준다 — 그러면 어떤 겹침도 검출되지 않는다(실제로 그렇게 통과했다).
   */
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.target-overlay text, .threat-overlay text')].map((n) => {
      const b = (n as SVGTextElement).getBBox();
      // text-anchor:end 인 라벨은 x 가 오른쪽 끝이지만 getBBox 는 실제 상자를 준다
      return { text: n.textContent ?? '', x: b.x, y: b.y, w: b.width, h: b.height };
    }),
  );
  expect(boxes.length, '라벨이 하나도 없다 — 시점이 틀렸다').toBeGreaterThan(1);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap =
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      expect(overlap, `라벨이 겹친다: "${a.text}" ↔ "${b.text}"`).toBe(false);
    }
  }
});

/**
 * GDD 7장은 가로 고정 전제다. `screen.orientation.lock('landscape')` 는
 * iOS 에 아예 없고 안드로이드도 전체화면일 때만 받으므로, 세로로 들었을 때
 * **화면이 그냥 찌그러지지 않도록** 마지막 방어선이 있어야 한다.
 */
test('세로로 들면 가로 안내가 뜨고, 가로에서는 사라진다', async ({ page }) => {
  await enterFlight(page);

  const notice = page.locator('#rotate-notice');
  await expect(notice, '가로인데 안내가 떠 있다 — 화면을 가린다').toBeHidden();

  await page.setViewportSize({ width: 412, height: 915 });
  await expect(notice, '세로인데 안내가 없다 — 찌그러진 화면을 그냥 보여준다').toBeVisible();
  await expect(notice).toContainText(/가로|LANDSCAPE/);
  await page.screenshot({ path: 'tests/__screenshots__/portrait-notice.png' });

  await page.setViewportSize({ width: 915, height: 412 });
  await expect(notice, '가로로 돌렸는데 안내가 안 사라진다').toBeHidden();
});

/**
 * T8a 완료 조건: 트럭에 부딪혀 격파되고, 격파 사실이 화면과 이벤트에 남는다.
 * 여기서는 그 전체 사슬을 브라우저에서 본다 — 돌입 → 기폭 → 표적 전소 → TGT DOWN.
 */
test('T8a 자폭 돌입 — 트럭에 박으면 격파되고 TGT DOWN 이 뜬다', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  const before = await page.evaluate(() => window.__debug.flight.strike());
  expect(before.struck).toBe(false);
  expect(before.targetsAlive).toBe(3);

  /**
   * 선두 트럭을 뒤에서 따라잡는다. 이 컨테이너는 ~1fps 라 실기동 추격은 타임아웃이
   * 나므로, 매 프레임 기체를 2m 씩 전진시키는 압축 궤적을 쓴다 — 판정 자체는
   * 실제 게임 루프의 findImpact 가 그대로 수행한다.
   */
  const result = await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    let z = -214; // 트럭 초기(-220) 살짝 뒤
    t.pos.set(120, t.pos.y + (2.5 - t.agl), z);
    t.yaw = 0;
    const deadline = window.__debug.frame + 60;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      z -= 2;
      t.pos.set(120, t.pos.y, z);
      t.vel.set(0, 0, -14);
      await new Promise((r) => requestAnimationFrame(r));
    }
    // crash 와 같은 프레임의 HUD — 다음 rAF 를 기다리면 디브리핑 전환과 경주하게 된다
    await new Promise((r) => requestAnimationFrame(r));
    return {
      crashed: window.__debug.flight.crashed(),
      strike: window.__debug.flight.strike(),
      hudStatus: document.querySelector('.hud-tl')?.textContent ?? '',
    };
  });

  expect(result.crashed, '돌입했는데 기폭이 없다').toBe('자폭 돌입');
  expect(result.strike.struck).toBe(true);
  expect(result.strike.targetsAlive, '격파됐는데 표적 수가 그대로다').toBe(2);
  // 화면: 정지 화면 위 상태가 NO LINK 가 아니라 TGT DOWN — 실패가 아니라 완수다.
  // ⚠️ crash 2.5초(벽시계) 뒤 디브리핑으로 넘어가며 HUD 가 사라진다(T8c) —
  // ~1fps 컨테이너에서 locator 왕복은 그 창을 놓치므로 crash 프레임에서 동기로 읽는다.
  expect(result.hudStatus, 'TGT DOWN 이 화면에 없다').toContain('TGT DOWN');
  await page.screenshot({ path: 'tests/__screenshots__/t8a-strike.png' });

  // 리스폰 후: 기체는 새것, 격파는 유지 (미션 재시작은 T8c 의 몫)
  const after = await page.evaluate(() => {
    window.__debug.flight.respawn();
    return window.__debug.flight.strike();
  });
  expect(after.struck, '리스폰이 struck 을 리셋하지 않았다').toBe(false);
  expect(after.targetsAlive, '리스폰이 격파를 되돌렸다').toBe(2);
});

/**
 * T8b 완료 조건: 경계 밖 3초 → 임무 실패, 맵 끝이 화면에 안 보인다.
 * 이탈은 벽이 아니라 신호로 막힌다 — 나가는 순간 경고가 뜨고 화면이 무너지기 시작해
 * 3초 뒤 링크가 끊긴다.
 */
test('T8b 작전 구역 — 이탈하면 경고 → 신호 붕괴 → 3초 뒤 링크 상실', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 경계 밖 30m 에 세워 둔다 (고도는 높게 — 신호 비교에 차폐가 섞이지 않게)
  const during = await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    t.pos.set(520, t.pos.y + 60, 0);
    t.vel.set(0, 0, 0);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    return {
      ao: window.__debug.flight.ao(),
      signal: Number(window.__debug.state.signalQuality),
    };
  });
  expect(during.ao.outside, '경계 밖인데 이탈 판정이 없다').toBe(true);
  expect(during.ao.warning).toBe(true);
  // 이탈 즉시 신호가 깎이기 시작한다 — 화면이 무너지는 연출의 근거
  await expect(page.locator('#hud .hud-tl')).toContainText('RTB');
  await page.screenshot({ path: 'tests/__screenshots__/t8b-ao-warning.png' });

  // 유예를 소진할 때까지 밖에 머문다
  const after = await page.evaluate(async () => {
    const deadline = window.__debug.frame + 120;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(520, t.pos.y, 0);
      t.vel.set(0, 0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { crashed: window.__debug.flight.crashed() };
  });
  expect(after.crashed, '유예가 끝났는데 링크가 살아 있다').toBe('작전 구역 이탈');
});

test('T8b 작전 구역 — 경계 근처에서 맵 끝이 화면에 보이지 않는다', async ({ page }) => {
  await enterFlight(page);
  // 경계 바로 안(470, 0)에서 바깥(+x)을 본다 — 스커트가 없으면 지형 끝(±800)과
  // 그 너머 허공이 화면 절반을 차지하던 시점이다 (sweep-10 의 재현).
  await page.evaluate(async () => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
    for (let i = 0; i < 4; i++) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(460, t.pos.y + (40 - t.agl), 0);
      t.vel.set(0, 0, 0);
      t.yaw = -Math.PI / 2; // +x 를 본다
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.screenshot({ path: 'tests/__screenshots__/t8b-horizon.png' });
  // 판정은 눈으로 한다 (CLAUDE.md 검증 절) — 여기서는 렌더가 죽지 않았다는 것만 고정
  const render = await page.evaluate(() => window.__debug.render);
  expect(render.triangles).toBeGreaterThan(50_000);
});

/**
 * T8c 완료 조건: M2 1차수 클리어 가능.
 * 전체 루프를 브라우저에서 완주한다: 격파 → 정지 화면 → 디브리핑(임무 완수) →
 * 재출격 → 링크 재수립 → 새 출격(월드 리셋).
 */
test('T8c 미션 루프 — 격파하면 디브리핑이 뜨고, 재출격하면 처음부터다', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 선두 트럭에 박는다 (T8a 와 같은 압축 궤적)
  await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    let z = -214;
    t.pos.set(120, t.pos.y + (2.5 - t.agl), z);
    t.yaw = 0;
    const deadline = window.__debug.frame + 60;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      z -= 2;
      t.pos.set(120, t.pos.y, z);
      t.vel.set(0, 0, -14);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  expect(await page.evaluate(() => window.__debug.flight.crashed())).toBe('자폭 돌입');

  // 정지 화면 2.5초 뒤 디브리핑 — 완수 판정과 격파 수가 찍힌다
  await page.waitForFunction(() => window.__debug.state.screen === 'debrief', null, { timeout: 30_000 });
  const panel = page.locator('#debrief');
  await expect(panel.locator('.db-result')).toContainText('임무 완수');
  await expect(panel).toContainText('격파 1/1');
  await page.screenshot({ path: 'tests/__screenshots__/t8c-debrief-win.png' });

  // 재출격 → 작전실(T9) → 출격 → 링크 재수립 → 새 출격. 월드가 새로 지어진다
  await panel.locator('.db-btn').click();
  await page.waitForFunction(() => window.__debug.state.screen === 'loadout', null, { timeout: 60_000 });
  await page.locator('.lo-sortie').click();
  await page.waitForFunction(() => window.__debug.state.screen === 'flight', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 120_000 });
  const fresh = await page.evaluate(() => window.__debug.flight.strike());
  expect(fresh.struck, '재출격인데 이전 격파 상태가 남아 있다').toBe(false);
  expect(fresh.targetsAlive, '재출격인데 표적이 복원되지 않았다').toBe(3);
});

test('T8c 미션 루프 — 위협에 격추되면 원인 1줄과 권고가 나온다 (GDD 4.5 규칙 4)', async ({ page }) => {
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // A1(104,-150) 사선에 노출 고도로 머문다 — 조준 0.9초 뒤 격추된다
  await page.evaluate(async () => {
    const deadline = window.__debug.frame + 300;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(104, t.pos.y + (14 - t.agl), -128);
      t.vel.set(0, 0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  expect(await page.evaluate(() => window.__debug.flight.crashed())).toBe('피격');

  await page.waitForFunction(() => window.__debug.state.screen === 'debrief', null, { timeout: 30_000 });
  const panel = page.locator('#debrief');
  await expect(panel.locator('.db-result')).toContainText('임무 실패');
  // 원인 1줄: "격추 원인: 산탄총 — 접근 고도 14m" + 권고
  await expect(panel).toContainText('산탄총');
  await expect(panel).toContainText('접근 고도');
  await expect(panel).toContainText('권고');
  await page.screenshot({ path: 'tests/__screenshots__/t8c-debrief-loss.png' });
});

/**
 * T9 완료 조건: 재접속 시 SP·재고 유지.
 * 격파 → 디브리핑에서 SP 지급 → **페이지를 완전히 새로 연다** → 작전실에 잔액이 남아 있다.
 */
test('T9 경제 — 격파 SP 가 지급되고 재접속해도 유지된다', async ({ page }) => {
  await page.goto('/');
  // 이전 테스트의 저장이 남지 않게 깨끗한 프로필에서 시작
  await page.evaluate(() => localStorage.clear());
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });

  // 격파 (압축 궤적)
  await page.evaluate(async () => {
    const t = window.__debug.flight.telemetry();
    let z = -214;
    t.pos.set(120, t.pos.y + (2.5 - t.agl), z);
    t.yaw = 0;
    const deadline = window.__debug.frame + 60;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      z -= 2;
      t.pos.set(120, t.pos.y, z);
      t.vel.set(0, 0, -14);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  expect(await page.evaluate(() => window.__debug.flight.crashed())).toBe('자폭 돌입');

  // 디브리핑: 정산 줄 — 트럭 40 SP
  await page.waitForFunction(() => window.__debug.state.screen === 'debrief', null, { timeout: 30_000 });
  await expect(page.locator('#debrief')).toContainText('+40 SP');
  await page.screenshot({ path: 'tests/__screenshots__/t9-debrief-sp.png' });

  // 재접속 — 완전히 새로 로드해도 작전실 잔액이 남아 있다 (05 문서: 저장 시점 = 디브리핑 확정)
  await page.goto('/');
  await expect(page.locator('#loadout .lo-sp')).toContainText('SP 40');
});

test('T9 작전실 — 어시스트 선택이 비행 모델을 정하고 저장된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  // 세미(프로 앵글) 선택 → 출격 → 비행 모델이 프로다
  await page.locator('[data-assist="semi"]').click();
  await page.locator('.lo-sortie').click();
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__debug.flight.mode())).toBe('pro');

  // 재접속해도 선택이 남아 있다 (저장 시점 = 설정 변경)
  await page.goto('/');
  await expect(page.locator('[data-assist="semi"]')).toHaveClass(/on/);
});

/**
 * T10 완료 조건(전반): 언어 전환 동작. 후반(중급 폰 60fps)은 실기 측정이 필요해
 * 이 환경에서 검증할 수 없다 — CLAUDE.md "이 환경에서 안 되는 것" 그대로.
 */
test('T10 i18n — 언어를 바꾸면 그 자리에서 바뀌고, 재접속해도 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  const sortie = page.locator('.lo-sortie');
  await expect(sortie).toContainText('출격');

  await page.locator('[data-lang="en"]').click();
  await expect(sortie, '언어를 바꿨는데 화면이 그대로다').toContainText('SORTIE');
  await page.screenshot({ path: 'tests/__screenshots__/t10-lang-en.png' });

  // 재접속 — 설정 저장(05 문서: 저장 시점 = 설정 변경)
  await page.goto('/');
  await expect(page.locator('.lo-sortie')).toContainText('SORTIE');

  // 인게임 문자열도 영어다 — 디브리핑까지 가는 대신 HUD 패드 라벨은 dev 전용이라
  // 가장 빠른 증거인 작전실 헤더로 확인한다
  await expect(page.locator('.lo-head')).toContainText('OPS ROOM');
  // 되돌리기 — 이후 테스트는 한국어 문구를 본다
  await page.locator('[data-lang="ko"]').click();
  await expect(page.locator('.lo-sortie')).toContainText('출격');
});
