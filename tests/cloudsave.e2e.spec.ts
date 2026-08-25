import { expect, test } from '@playwright/test';
import { closeDb, db, migrate } from '../api/_lib/db';

/**
 * 브라우저 → dev-api 미들웨어 → 실제 Postgres 까지 전 구간.
 * 서비스 단위 테스트(cloudsave.spec.ts)가 못 잡는 것 —
 * fetch 경로, 라우트 배선, localStorage 자격증명 왕복 — 을 여기서 잡는다.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);

test.beforeAll(async () => {
  if (!HAS_DB && process.env.CI) {
    throw new Error('CI 에서 DATABASE_URL 이 없다 — 클라우드 세이브 E2E 가 실행되지 않았다');
  }
  if (HAS_DB) await migrate(true);
});

test.afterAll(async () => {
  if (HAS_DB) await closeDb();
});

test.beforeEach(async () => {
  test.skip(!HAS_DB, 'DATABASE_URL 없음');
  await db().query('truncate profiles, profile_devices, link_codes, link_attempts cascade');
});

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 15_000 });
}

test('클라우드 켜기 → 진행 저장 → 동기화', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__debug.cloud.isEnabled())).toBe(false);

  await page.evaluate(() => window.__debug.cloud.enable());
  expect(await page.evaluate(() => window.__debug.cloud.isEnabled())).toBe(true);

  await page.evaluate(() => window.__debug.cloud.sync());
  expect(await page.evaluate(() => window.__debug.cloud.status())).toContain('동기화');

  const { rows } = await db().query('select count(*)::int as n from profiles');
  expect(rows[0].n).toBe(1);
});

test('기기 A 코드 발급 → 기기 B 이어받기 → 진행이 넘어온다', async ({ browser }) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  await boot(pageA);

  // A 에서 진행을 만들고 클라우드에 올린다.
  await pageA.evaluate(async () => {
    await window.__debug.cloud.enable();
    const profile = window.__debug.cloud.profile() as { sp: number };
    profile.sp = 4321;
    await window.__debug.cloud.sync();
  });

  const code = await pageA.evaluate(async () => (await window.__debug.cloud.createLinkCode()).code);
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

  // B 는 완전히 다른 브라우저 컨텍스트 = 다른 localStorage.
  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await boot(pageB);
  expect(await pageB.evaluate(() => window.__debug.cloud.isEnabled())).toBe(false);

  await pageB.evaluate((c) => window.__debug.cloud.claimLinkCode(c), code);

  expect(await pageB.evaluate(() => window.__debug.cloud.isEnabled())).toBe(true);
  expect(await pageB.evaluate(() => (window.__debug.cloud.profile() as { sp: number }).sp)).toBe(4321);

  // A 도 계속 동작해야 한다 — 시크릿 회전 방식이면 여기서 깨진다.
  await pageA.evaluate(() => window.__debug.cloud.sync());
  expect(await pageA.evaluate(() => window.__debug.cloud.status())).not.toContain('오류');

  await deviceA.close();
  await deviceB.close();
});

test('잘못된 코드는 오류를 내고 자격증명을 건드리지 않는다', async ({ page }) => {
  await boot(page);
  const failed = await page.evaluate(async () => {
    try {
      await window.__debug.cloud.claimLinkCode('AAAA-AAAA');
      return null;
    } catch (e) {
      return String(e);
    }
  });
  expect(failed).toBeTruthy();
  expect(await page.evaluate(() => window.__debug.cloud.isEnabled())).toBe(false);
});

test('패널이 열리고 스타일 규칙을 지킨다', async ({ page }) => {
  await boot(page);

  // 콘솔이 아니라 화면의 버튼으로 연다 — 폰에서 실제로 쓰는 경로.
  await page.locator('.hud-btn').click();

  const panel = page.locator('#cloud-panel .panel');
  await expect(panel).toBeVisible();

  // 04 문서 금지 목록: 라운드 모서리·그림자 금지.
  const style = await panel.evaluate((el) => {
    const cs = getComputedStyle(el);
    const btn = getComputedStyle(el.querySelector('.btn')!);
    return { radius: cs.borderRadius, shadow: cs.boxShadow, btnRadius: btn.borderRadius, btnBg: btn.backgroundColor };
  });
  expect(style.radius).toBe('0px');
  expect(style.shadow).toBe('none');
  expect(style.btnRadius).toBe('0px');
  expect(style.btnBg).toBe('rgba(0, 0, 0, 0)'); // 버튼 채우기 없음

  await page.screenshot({ path: 'tests/__screenshots__/cloud-panel.png' });
});
