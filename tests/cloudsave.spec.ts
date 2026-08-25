import { expect, test } from '@playwright/test';
import { closeDb, db, migrate } from '../api/_lib/db';
import { normalizeLinkCode } from '../api/_lib/crypto';
import {
  MAX_DATA_BYTES,
  claimLink,
  createLink,
  createProfile,
  pullProfile,
  pushProfile,
} from '../api/_lib/service';

/**
 * 실제 Postgres 를 상대로 도는 통합 테스트다. 스텁이 아니다 —
 * 낙관적 잠금과 1회성 코드는 DB 의 원자성에 기대므로 스텁으로는 검증이 안 된다.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);

test.beforeAll(async () => {
  // CI 에서는 반드시 DB 가 있어야 한다. 조용히 건너뛰면 통과처럼 보인다.
  if (!HAS_DB && process.env.CI) {
    throw new Error('CI 에서 DATABASE_URL 이 없다 — 클라우드 세이브 테스트가 실행되지 않았다');
  }
  if (!HAS_DB) return;
  await migrate(true);
});

test.afterAll(async () => {
  if (HAS_DB) await closeDb();
});

test.beforeEach(async () => {
  test.skip(!HAS_DB, 'DATABASE_URL 없음 — 로컬 Postgres 를 띄우면 실행된다');
  await db().query('truncate profiles, profile_devices, link_codes, link_attempts cascade');
});

function body<T>(result: { body: unknown }): T {
  return result.body as T;
}

test('프로필 생성 → pull 이 같은 데이터를 돌려준다', async () => {
  const created = await createProfile({ sp: 1240, stats: { totalKills: 41 } }, 1);
  expect(created.status).toBe(200);
  const { secret, profileId, rev } = body<{ secret: string; profileId: string; rev: number }>(created);
  expect(rev).toBe(1);

  const pulled = await pullProfile(secret);
  expect(pulled.status).toBe(200);
  expect(body<{ profileId: string; data: { sp: number } }>(pulled).profileId).toBe(profileId);
  expect(body<{ data: { sp: number } }>(pulled).data.sp).toBe(1240);
});

test('알 수 없는 시크릿은 401', async () => {
  expect((await pullProfile('없는-시크릿')).status).toBe(401);
  expect((await pushProfile('없는-시크릿', 1, {}, 1)).status).toBe(401);
  expect((await createLink('없는-시크릿')).status).toBe(401);
});

test('push 는 baseRev 가 맞을 때만 통과하고 rev 를 올린다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({ sp: 0 }, 1));

  const pushed = await pushProfile(secret, 1, { sp: 100 }, 1);
  expect(pushed.status).toBe(200);
  expect(body<{ rev: number }>(pushed).rev).toBe(2);

  const pulled = await pullProfile(secret);
  expect(body<{ data: { sp: number }; rev: number }>(pulled).data.sp).toBe(100);
  expect(body<{ rev: number }>(pulled).rev).toBe(2);
});

test('낡은 baseRev 로 push 하면 409 와 함께 서버본이 돌아온다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({ sp: 0 }, 1));

  // 기기 A 가 먼저 올린다.
  await pushProfile(secret, 1, { sp: 500 }, 1);

  // 기기 B 는 아직 rev 1 을 들고 있다 → 충돌.
  const stale = await pushProfile(secret, 1, { sp: 10 }, 1);
  expect(stale.status).toBe(409);
  const server = body<{ rev: number; data: { sp: number } }>(stale);
  expect(server.rev).toBe(2);
  expect(server.data.sp).toBe(500); // 서버본이 실려 와야 클라이언트가 비교할 수 있다

  // 충돌한 push 는 반영되지 않았어야 한다.
  expect(body<{ data: { sp: number } }>(await pullProfile(secret)).data.sp).toBe(500);
});

test('이어하기: 코드로 붙은 새 기기는 자기 시크릿을 받고, 원래 기기도 계속 동작한다', async () => {
  const { secret: secretA } = body<{ secret: string }>(await createProfile({ sp: 777 }, 1));

  const link = await createLink(secretA);
  expect(link.status).toBe(200);
  const { code } = body<{ code: string }>(link);
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

  const claimed = await claimLink(code, '1.1.1.1');
  expect(claimed.status).toBe(200);
  const { secret: secretB } = body<{ secret: string }>(claimed);
  expect(secretB).not.toBe(secretA);

  // 두 기기가 같은 프로필을 본다.
  expect(body<{ data: { sp: number } }>(await pullProfile(secretB)).data.sp).toBe(777);
  // ...그리고 원래 기기가 튕기지 않는다. 시크릿 회전 방식이었다면 여기서 깨진다.
  expect(body<{ data: { sp: number } }>(await pullProfile(secretA)).data.sp).toBe(777);
});

test('코드는 1회용이다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({}, 1));
  const { code } = body<{ code: string }>(await createLink(secret));

  expect((await claimLink(code, '1.1.1.1')).status).toBe(200);
  expect((await claimLink(code, '1.1.1.1')).status).toBe(404);
});

test('만료된 코드는 거부된다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({}, 1));
  const { code } = body<{ code: string }>(await createLink(secret));

  await db().query(`update link_codes set expires_at = now() - interval '1 minute'`);
  expect((await claimLink(code, '1.1.1.1')).status).toBe(404);
});

test('코드 입력은 대소문자·하이픈·공백 차이를 흡수한다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({}, 1));
  const { code } = body<{ code: string }>(await createLink(secret));

  const messy = ` ${code.toLowerCase().replace('-', ' ')} `;
  expect(normalizeLinkCode(messy)).toBe(normalizeLinkCode(code));
  expect((await claimLink(messy, '1.1.1.1')).status).toBe(200);
});

test('새 코드를 뽑으면 이전 미사용 코드는 무효가 된다', async () => {
  const { secret } = body<{ secret: string }>(await createProfile({}, 1));
  const first = body<{ code: string }>(await createLink(secret)).code;
  const second = body<{ code: string }>(await createLink(secret)).code;

  expect((await claimLink(first, '1.1.1.1')).status).toBe(404);
  expect((await claimLink(second, '1.1.1.1')).status).toBe(200);
});

test('코드 무차별 대입은 시도 제한에 걸린다', async () => {
  for (let i = 0; i < 10; i++) {
    expect((await claimLink('AAAA-AAAA', '9.9.9.9')).status).toBe(404);
  }
  expect((await claimLink('AAAA-AAAA', '9.9.9.9')).status).toBe(429);

  // 다른 IP 는 영향받지 않는다.
  expect((await claimLink('AAAA-AAAA', '8.8.8.8')).status).toBe(404);
});

test('상한을 넘는 세이브는 413', async () => {
  const huge = { blob: 'x'.repeat(MAX_DATA_BYTES + 1) };
  expect((await createProfile(huge, 1)).status).toBe(413);

  const { secret } = body<{ secret: string }>(await createProfile({}, 1));
  expect((await pushProfile(secret, 1, huge, 1)).status).toBe(413);
});
