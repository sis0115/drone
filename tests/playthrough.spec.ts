import { expect, test } from '@playwright/test';
import { enterFlight } from './enterFlight';

/**
 * 자동조종 플레이스루 — **밸런스 회귀 테스트** (`npm run play`, 기본 실행 제외 — 판당 ~5분).
 * 실제 게임 입력(setInput)만 쓴다. 순간이동 없음.
 *
 * 첫 미션의 계약 (DEVLOG 2026-08-27 실측으로 잡은 곡선):
 *   ① 브리핑 조언대로 하면(35m 순항 → 강하) **완주된다**
 *   ② 순진하게 직진하면 죽는다 — 단, 경고 무전과 죽음 사이에 **반응할 시간**이 있다
 * 위협 수치·배치를 바꾸면 이 스펙부터 돌려라.
 */
async function playthrough(
  page: import('@playwright/test').Page,
  plan: 'naive' | 'advised',
): Promise<unknown> {
  return page.evaluate(async (mode) => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const log: string[] = [];
    let lastRadio = '';
    let phase = 'cruise';

    window.__debug.setInput(() => {
      const t = window.__debug.flight.telemetry();
      const targets = window.__debug.flight.targets().filter((x) => x.alive);
      if (!targets.length) return {};
      let best = targets[0];
      let bd = 1e9;
      for (const g of targets) {
        const d = Math.hypot(g.x - t.pos.x, g.z - t.pos.z);
        if (d < bd) { bd = d; best = g; }
      }
      const desired = Math.atan2(-(best.x - t.pos.x), -(best.z - t.pos.z));
      const err = wrap(desired - t.yaw);
      const roll = Math.max(-1, Math.min(1, err * 1.6));

      // 고도 계획: naive = 기본 18m 유지 / advised = 35m 순항, 45m 안에서 강하
      let wantAgl = mode === 'naive' ? 18 : 35;
      if (mode === 'advised' && bd < 45) { phase = 'dive'; }
      if (phase === 'dive') wantAgl = 3;
      const throttle = Math.max(-1, Math.min(1, (wantAgl - t.agl) * 0.35));
      return { pitch: Math.abs(err) < 1.2 ? 1 : 0.35, roll, throttle };
    });

    const start = window.__debug.frame;
    while (window.__debug.frame < start + 700 && !window.__debug.flight.crashed()) {
      await new Promise((r) => requestAnimationFrame(r));
      const t = window.__debug.flight.telemetry();
      const th = window.__debug.flight.threats();
      const radio = document.querySelector('.hud-radio.show')?.textContent ?? '';
      if (radio && radio !== lastRadio) { lastRadio = radio; log.push(`[${(window.__debug.frame - start) * 0.05 | 0}s] 무전: ${radio}`); }
      if ((window.__debug.frame - start) % 40 === 0) {
        log.push(
          `[${(window.__debug.frame - start) * 0.05 | 0}s] pos(${t.pos.x.toFixed(0)},${t.pos.z.toFixed(0)}) agl ${t.agl.toFixed(0)} spd ${(t.spd * 3.6).toFixed(0)} ` +
          `sig ${window.__debug.state.signalQuality} threat ${th.warning ? th.warning.id + ':' + th.warning.kind : '-'} ${phase}`,
        );
      }
    }
    window.__debug.setInput(null);
    const t = window.__debug.flight.telemetry();
    return {
      crashed: window.__debug.flight.crashed(),
      strike: window.__debug.flight.strike(),
      simSec: ((window.__debug.frame - start) * 0.05) | 0,
      endPos: { x: t.pos.x | 0, z: t.pos.z | 0, agl: t.agl | 0 },
      log,
    };
  }, plan);
}

test('플레이스루 1 — 순진한 직진 (첫 판 시뮬)', async ({ page }) => {
  test.setTimeout(900_000);
  await enterFlight(page);
  await page.evaluate(() => { window.__debug.flight.setWindCalm(); window.__debug.flight.respawn(); });
  const r = (await playthrough(page, 'naive')) as {
    crashed: string;
    log: string[];
  };
  console.log('\n=== NAIVE ===\n' + JSON.stringify(r, null, 1));
  // 배우는 판: 죽는 것이 정상이되, 예고가 있어야 한다
  expect(r.crashed).toBe('피격');
  const warnAt = r.log.find((l) => l.includes('산탄총이다'));
  expect(warnAt, '경고 무전 없이 죽었다').toBeTruthy();
  await page.screenshot({ path: 'tests/__screenshots__/play-naive-end.png' });
});

test('플레이스루 2 — 조언대로 (35m 순항 → 강하)', async ({ page }) => {
  test.setTimeout(900_000);
  await enterFlight(page);
  await page.evaluate(() => { window.__debug.flight.setWindCalm(); window.__debug.flight.respawn(); });
  const r = (await playthrough(page, 'advised')) as {
    crashed: string;
    strike: { struck: boolean };
  };
  console.log('\n=== ADVISED ===\n' + JSON.stringify(r, null, 1));
  // 조언대로 하면 이긴다 — 이게 깨지면 첫 미션이 "조언대로 해도 죽는" 판이 된 것이다
  expect(r.crashed, '조언대로 했는데 격파하지 못했다').toBe('자폭 돌입');
  expect(r.strike.struck).toBe(true);
  await page.screenshot({ path: 'tests/__screenshots__/play-advised-end.png' });
});
