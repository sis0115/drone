import { test } from '@playwright/test';
import { enterFlight } from './enterFlight';

/**
 * 디자인 점검 샷 — 3D 씬 품질 반복 개선용 (`npm run design`).
 *
 * **같은 시점을 매 회차 똑같이 찍는 것**이 목적이다. 눈으로 비교해야
 * "좋아졌나"를 판정할 수 있고, 그러려면 시점이 흔들리면 안 된다.
 * 컬러로 찍는다 — 흑백은 형태 문제를 가린다.
 */
const VIEWS = [
  // 스폰 — 플레이어가 이 게임에서 **처음 보는 화면**. 여기가 첫인상을 정한다.
  { id: 'a-spawn', x: 0, z: 0, agl: 16, yaw: Math.atan2(-120, 220), pitch: -0.06 },
  // 도로 진입 — 강하 직전, 표적 종대와 도로가 함께 보이는 각
  { id: 'b-road', x: 104, z: -70, agl: 22, yaw: Math.PI, pitch: -0.16 },
  // 상공 — 지형의 **형태**가 보이는 각. 평평하면 여기서 들통난다
  { id: 'c-high', x: 40, z: -60, agl: 75, yaw: Math.atan2(-120, 220), pitch: -0.34 },
];

test('디자인 점검 — 고정 3시점 컬러 샷', async ({ page }) => {
  test.setTimeout(600_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'slfpv.save.v1',
      JSON.stringify({
        schemaVersion: 1,
        introSeen: true,
        ownedModules: ['cam.analogBw', 'cam.analogColor', 'cam.thermal'],
      }),
    );
  });
  await enterFlight(page);
  await page.evaluate(() => {
    window.__debug.flight.setWindCalm();
    window.__debug.flight.setCamMode('color');
  });

  for (const v of VIEWS) {
    await page.evaluate(async (view) => {
      const t = window.__debug.flight.telemetry();
      t.pos.set(view.x, 0, view.z);
      // 지면 위 정확한 고도로 올린다 — 한 프레임 굴려 agl 을 읽고 보정
      await new Promise((r) => requestAnimationFrame(r));
      t.pos.y += view.agl - t.agl;
      t.vel.set(0, 0, 0);
      t.yaw = view.yaw;
      t.pitch = view.pitch;
      t.roll = 0;
      const n = window.__debug.frame + 4;
      while (window.__debug.frame < n) await new Promise((r) => requestAnimationFrame(r));
    }, v);
    await page.screenshot({ path: `tests/__screenshots__/design/${v.id}.png` });
  }
});
