import { test } from '@playwright/test';

/** 세로 메뉴 점검 — 좁은 폭(412px)에서 패널이 깨지지 않는지 (`npm run design` 과 같은 성격). */
test('세로 메뉴 샷', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'slfpv.save.v1',
      JSON.stringify({ schemaVersion: 1, introSeen: true, sp: 900,
        ownedModules: ['cam.analogBw', 'cam.analogColor', 'cam.thermal'] }),
    );
  });
  await page.goto('/');
  await page.locator('#title').click();
  await page.screenshot({ path: 'tests/__screenshots__/portrait-loadout.png' });
  await page.locator('.lo-frame').click();
  await page.screenshot({ path: 'tests/__screenshots__/portrait-hangar.png' });
  await page.locator('.hg-back').click();
  await page.locator('.lo-sortie').click();
  await page.locator('.br-panel').click();
  await page.screenshot({ path: 'tests/__screenshots__/portrait-briefing.png' });
});
