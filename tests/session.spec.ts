import { test } from '@playwright/test';
import { enterFlight } from './enterFlight';

/**
 * 플레이 세션 점검 — 사람이 앉아서 한 판 하는 것과 같은 경로로 돌리고,
 * **경제(SP)와 체감**을 계측한다. 밸런스 회귀(playthrough.spec)와 목적이 다르다:
 * 저건 "죽나 사나"를 잠그고, 이건 "포인트가 말이 되나"를 본다.
 * `PLAY=1` 로만 돈다 (기본 실행 제외).
 */
type Page = import('@playwright/test').Page;

/** 브리핑 조언대로 나는 자동조종 — 35m 순항 후 45m 안에서 강하 */
async function fly(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const marks: string[] = [];
    let phase = 'cruise';
    let lastRadio = '';
    let battAtKill = -1;

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
      const err = wrap(Math.atan2(-(best.x - t.pos.x), -(best.z - t.pos.z)) - t.yaw);
      if (bd < 45) phase = 'dive';
      const wantAgl = phase === 'dive' ? 3 : 35;
      return {
        pitch: Math.abs(err) < 1.2 ? 1 : 0.35,
        roll: Math.max(-1, Math.min(1, err * 1.6)),
        throttle: Math.max(-1, Math.min(1, (wantAgl - t.agl) * 0.35)),
      };
    });

    const start = window.__debug.frame;
    while (window.__debug.frame < start + 700 && !window.__debug.flight.crashed()) {
      await new Promise((r) => requestAnimationFrame(r));
      const sec = ((window.__debug.frame - start) * 0.05).toFixed(1);
      const radio = document.querySelector('.hud-radio.show')?.textContent ?? '';
      if (radio && radio !== lastRadio) { lastRadio = radio; marks.push(`[${sec}s] 무전: ${radio}`); }
      if (battAtKill < 0 && window.__debug.flight.strike().struck) {
        battAtKill = window.__debug.flight.battery(); // 0~100 (%)
        marks.push(`[${sec}s] 격파 — 배터리 잔량 ${battAtKill | 0}% (쓴 양 ${(100 - battAtKill) | 0}%)`);
      }
    }
    window.__debug.setInput(null);
    return {
      결과: window.__debug.flight.crashed(),
      격파: window.__debug.flight.strike().struck,
      비행초: Number((((window.__debug.frame - start) * 0.05)).toFixed(1)),
      격파시_배터리_퍼센트: battAtKill < 0 ? null : Math.round(battAtKill),
      쓴_배터리_퍼센트: battAtKill < 0 ? null : Math.round(100 - battAtKill),
      진행: marks,
    };
  });
}

async function sp(page: Page): Promise<number> {
  return page.evaluate(() => Number(window.__debug.state.sp ?? 0));
}

test('플레이 세션 — 포인트 개념과 한 판의 체감', async ({ page }) => {
  test.setTimeout(900_000);
  const report: Record<string, unknown> = {};

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // ── 1판: 첫 출격 (사람 경로 그대로) ──
  await enterFlight(page);
  await page.evaluate(() => window.__debug.flight.setWindCalm());
  report['1판'] = await fly(page);

  await page.waitForFunction(() => window.__debug.state.screen === 'debrief', null, { timeout: 60_000 });
  report['1판_디브리핑'] = await page.locator('#debrief .db-panel').innerText();
  report['1판_후_SP'] = await sp(page);

  // 아웃트로 → 격납고: 장관이 가리킨 곳에서 실제로 뭘 살 수 있나
  await page.locator('#debrief .db-btn').click();
  await page.waitForFunction(() => window.__debug.state.screen === 'outro', null, { timeout: 60_000 });
  await page.locator('#outro').click();
  await page.locator('.ou-hangar').click();
  report['격납고_첫방문'] = await page.locator('#hangar .hg-panel').innerText();

  // ── 2판: 재도전 (첫 실적 보너스 없음) ──
  await page.locator('.hg-back').click();
  report['작전실_완수후'] = await page.locator('#loadout .lo-panel').innerText();
  await page.locator('.lo-sortie').click();
  await page.locator('.br-panel').click();
  await page.locator('.br-launch').click();
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 120_000 });
  await page.evaluate(() => window.__debug.flight.setWindCalm());
  report['2판'] = await fly(page);
  await page.waitForFunction(() => window.__debug.state.screen === 'debrief', null, { timeout: 60_000 });
  report['2판_디브리핑'] = await page.locator('#debrief .db-panel').innerText();
  const after2 = await sp(page);
  report['2판_후_SP'] = after2;

  // ── 경제 산수: 유일한 구매 대상까지 몇 판인가 ──
  const perRun = after2 - (report['1판_후_SP'] as number);
  report['경제'] = {
    첫판: report['1판_후_SP'],
    재도전_1판당: perRun,
    호넷10_가격: 800,
    호넷까지_남은_판수: Math.ceil((800 - after2) / perRun),
    총_필요_판수: 1 + Math.ceil((800 - (report['1판_후_SP'] as number)) / perRun),
    // 호넷의 이점은 배터리 +30% 다. 한 판에 배터리를 얼마나 쓰는지와 나란히 봐야
    // 이 구매가 의미가 있는지 판정된다.
    한판_배터리_사용률: (report['2판'] as Record<string, unknown>)['쓴_배터리_퍼센트'],
  };

  console.log('\n===== 플레이 세션 리포트 =====\n' + JSON.stringify(report, null, 1));
});
