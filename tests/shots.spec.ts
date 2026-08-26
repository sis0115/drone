import { test } from '@playwright/test';

/**
 * 점검용 스크린샷 스윕 — `npm run shots`. 기본 테스트 실행에서는 제외된다.
 *
 * 여기서 만드는 것은 **판정이 아니라 자료**다. 단언을 넣지 않는 이유:
 * 화면이 "맞는지"는 사람 눈이 정하고, 테스트가 통과했다는 사실은
 * 화면이 맞다는 뜻이 아니다(CLAUDE.md 검증 절). 상태를 빠짐없이 늘어놓는 것이 목적이다.
 *
 * 파일은 `tests/__screenshots__/sweep-*.png`.
 */

const DIR = 'tests/__screenshots__';

/** 몇 프레임 굴린다. 이 컨테이너는 ~1fps 라 프레임 수가 곧 대기 시간이다. */
async function frames(page: import('@playwright/test').Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    const target = window.__debug.frame + count;
    while (window.__debug.frame < target) await new Promise((r) => requestAnimationFrame(r));
  }, n);
}

/** 지정 좌표·고도에 세워 둔다. agl 은 지형에 따라 다르므로 몇 번 보정한다. */
async function park(
  page: import('@playwright/test').Page,
  x: number,
  z: number,
  agl: number,
  yaw = 0,
): Promise<void> {
  await page.evaluate(
    async ([px, pz, want, y]) => {
      for (let i = 0; i < 4; i++) {
        const t = window.__debug.flight.telemetry();
        t.pos.set(px, t.pos.y + (want - t.agl), pz);
        t.vel.set(0, 0, 0);
        t.yaw = y;
        await new Promise((r) => requestAnimationFrame(r));
      }
    },
    [x, z, agl, yaw] as const,
  );
}

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.respawn();
  });
}

test('링크 접속 화면', async ({ page }) => {
  await page.goto('/');
  // 부트 게이트가 끝나기 전에 잡는다 — 이 화면은 0.6초만 산다
  await page.screenshot({ path: `${DIR}/sweep-01-link.png` });
});

test('이륙 직후 — 기본 상태', async ({ page }) => {
  await boot(page);
  await park(page, 0, 0, 18);
  await page.screenshot({ path: `${DIR}/sweep-02-spawn.png` });
});

test('저공 비행 — 식생 밀도와 근거리 지형', async ({ page }) => {
  await boot(page);
  await park(page, -40, -60, 4);
  await page.screenshot({ path: `${DIR}/sweep-03-low.png` });
});

test('고공 — 맵 전경과 안개 경계', async ({ page }) => {
  await boot(page);
  await park(page, 0, 40, 160);
  await page.screenshot({ path: `${DIR}/sweep-04-high.png` });
});

test('마을 — 건물·지붕·굴뚝', async ({ page }) => {
  await boot(page);
  await park(page, -150, -180, 28, Math.PI * 0.25);
  await page.screenshot({ path: `${DIR}/sweep-05-village.png` });
});

test('표적 원거리 지시', async ({ page }) => {
  await boot(page);
  await park(page, 120, -80, 22);
  await page.screenshot({ path: `${DIR}/sweep-06-target-far.png` });
});

test('표적 락온', async ({ page }) => {
  await boot(page);
  await park(page, 120, -178, 12);
  await page.screenshot({ path: `${DIR}/sweep-07-target-lock.png` });
});

test('프로 모드 — 기울기와 관성', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__debug.flight.setMode('pro'));
  await park(page, 60, -40, 20);
  await page.evaluate(() => window.__debug.setInput(() => ({ pitch: 1, roll: 0.5 })));
  await frames(page, 12);
  await page.screenshot({ path: `${DIR}/sweep-08-pro.png` });
  await page.evaluate(() => window.__debug.setInput(null));
});

test('저전압 경고', async ({ page }) => {
  await boot(page);
  await park(page, 20, -30, 16);
  // 180초 체공을 실시간으로 기다리면 ~1fps 에서 한 장도 못 찍는다
  await page.evaluate(() => window.__debug.flight.setBattery(17));
  await frames(page, 2);
  await page.screenshot({ path: `${DIR}/sweep-09-lowbatt.png` });
});

test('신호 열화 — 원거리', async ({ page }) => {
  await boot(page);
  await park(page, 420, -420, 60);
  await frames(page, 25);
  await page.screenshot({ path: `${DIR}/sweep-10-weak-signal.png` });
});

test('위협 A1 — 존재 표시', async ({ page }) => {
  await boot(page);
  await park(page, 104, -80, 16);
  await page.screenshot({ path: `${DIR}/sweep-11-threat-watch.png` });
});

test('위협 A1 — 조준 예고', async ({ page }) => {
  await boot(page);
  await park(page, 104, -128, 14);
  await page.screenshot({ path: `${DIR}/sweep-12-threat-aim.png` });
});

test('격추 — SIGNAL LOST', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const deadline = window.__debug.frame + 300;
    while (window.__debug.frame < deadline && !window.__debug.flight.crashed()) {
      const t = window.__debug.flight.telemetry();
      t.pos.set(104, t.pos.y + (14 - t.agl), -128);
      t.vel.set(0, 0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.screenshot({ path: `${DIR}/sweep-13-dead.png` });
});

test('열화상 — 마을', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__debug.flight.setCamMode('thermal'));
  await park(page, -150, -180, 28, Math.PI * 0.25);
  await page.screenshot({ path: `${DIR}/sweep-14-thermal-village.png` });
});

test('흑백 — 기본 시야', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__debug.flight.setCamMode('bw'));
  await park(page, 120, -178, 12);
  await page.screenshot({ path: `${DIR}/sweep-15-bw-lock.png` });
});
