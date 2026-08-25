import { db, withTransaction } from './db.js';
import { newLinkCode, newSecret, normalizeLinkCode, sha256 } from './crypto.js';
import { fail, ok, type ApiResult } from './http.js';

/** 이어하기 코드 유효 시간. 길수록 무차별 대입 여유가 생기므로 짧게 잡는다. */
const LINK_TTL_MIN = 10;
/** 같은 IP 에서 이 횟수 이상 실패하면 창이 지날 때까지 막는다. */
const CLAIM_MAX_FAILURES = 10;
const CLAIM_WINDOW_MIN = 15;
/** 세이브 1건 상한. PlayerProfile 은 수 KB 수준이라 넉넉하다. */
export const MAX_DATA_BYTES = 256 * 1024;

export interface ProfileSnapshot {
  profileId: string;
  rev: number;
  schemaVersion: number;
  data: unknown;
}

/** 시크릿으로 프로필을 찾는다. 해시 기본키 조회라 평문 비교가 없다. */
async function resolveDevice(secret: string): Promise<string | null> {
  const { rows } = await db().query<{ profile_id: string }>(
    `update profile_devices set last_seen_at = now()
      where secret_hash = $1
      returning profile_id`,
    [sha256(secret)],
  );
  return rows[0]?.profile_id ?? null;
}

function tooBig(data: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(data ?? null), 'utf8') > MAX_DATA_BYTES;
}

/** 최초 1회. 빈 프로필과 이 기기의 시크릿을 함께 만든다. */
export async function createProfile(
  data: unknown,
  schemaVersion: number,
): Promise<ApiResult<{ profileId: string; secret: string; rev: number }>> {
  if (tooBig(data)) return fail(413, 'too_large', '세이브 데이터가 상한을 넘었습니다');

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; rev: number }>(
      `insert into profiles (schema_version, data, rev)
       values ($1, $2::jsonb, 1)
       returning id, rev`,
      [schemaVersion, JSON.stringify(data ?? {})],
    );
    const secret = newSecret();
    await client.query(
      `insert into profile_devices (secret_hash, profile_id, last_seen_at)
       values ($1, $2, now())`,
      [sha256(secret), rows[0].id],
    );
    return ok({ profileId: rows[0].id, secret, rev: rows[0].rev });
  });
}

export async function pullProfile(secret: string): Promise<ApiResult<ProfileSnapshot>> {
  const profileId = await resolveDevice(secret);
  if (!profileId) return fail(401, 'unauthorized', '알 수 없는 기기입니다');

  const { rows } = await db().query<{ rev: number; schema_version: number; data: unknown }>(
    `select rev, schema_version, data from profiles where id = $1`,
    [profileId],
  );
  if (!rows[0]) return fail(404, 'not_found', '프로필이 없습니다');

  return ok({
    profileId,
    rev: rows[0].rev,
    schemaVersion: rows[0].schema_version,
    data: rows[0].data,
  });
}

/**
 * 낙관적 잠금. `baseRev` 가 서버의 현재 rev 와 다르면 409 와 함께 서버본을 돌려준다.
 * 두 기기가 각자 진행한 경우가 여기 걸리며, 어느 쪽을 남길지는 클라이언트가 정한다.
 */
export async function pushProfile(
  secret: string,
  baseRev: number,
  data: unknown,
  schemaVersion: number,
): Promise<ApiResult<{ rev: number } | ProfileSnapshot>> {
  if (tooBig(data)) return fail(413, 'too_large', '세이브 데이터가 상한을 넘었습니다');

  const profileId = await resolveDevice(secret);
  if (!profileId) return fail(401, 'unauthorized', '알 수 없는 기기입니다');

  const { rows } = await db().query<{ rev: number }>(
    `update profiles
        set data = $1::jsonb, schema_version = $2, rev = rev + 1, updated_at = now()
      where id = $3 and rev = $4
      returning rev`,
    [JSON.stringify(data ?? {}), schemaVersion, profileId, baseRev],
  );

  if (rows[0]) return ok({ rev: rows[0].rev });

  // rev 불일치 — 서버본을 그대로 실어 보내 클라이언트가 비교할 수 있게 한다.
  const current = await db().query<{ rev: number; schema_version: number; data: unknown }>(
    `select rev, schema_version, data from profiles where id = $1`,
    [profileId],
  );
  if (!current.rows[0]) return fail(404, 'not_found', '프로필이 없습니다');

  return {
    status: 409,
    body: {
      profileId,
      rev: current.rows[0].rev,
      schemaVersion: current.rows[0].schema_version,
      data: current.rows[0].data,
    },
  };
}

/** 이 프로필로 다른 기기를 붙일 수 있는 1회성 코드를 발급한다. */
export async function createLink(
  secret: string,
): Promise<ApiResult<{ code: string; expiresAt: string }>> {
  const profileId = await resolveDevice(secret);
  if (!profileId) return fail(401, 'unauthorized', '알 수 없는 기기입니다');

  // 기존 미사용 코드는 무효화한다 — 살아 있는 코드가 여러 개일 이유가 없다.
  await db().query(`delete from link_codes where profile_id = $1 and used_at is null`, [profileId]);

  const code = newLinkCode();
  const { rows } = await db().query<{ expires_at: Date }>(
    `insert into link_codes (code_hash, profile_id, expires_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval)
     returning expires_at`,
    [sha256(normalizeLinkCode(code)), profileId, String(LINK_TTL_MIN)],
  );

  return ok({ code, expiresAt: rows[0].expires_at.toISOString() });
}

async function recordFailure(ip: string): Promise<void> {
  await db().query(`insert into link_attempts (ip) values ($1)`, [ip]);
}

async function isRateLimited(ip: string): Promise<boolean> {
  const { rows } = await db().query<{ count: string }>(
    `select count(*)::text as count from link_attempts
      where ip = $1 and at > now() - ($2 || ' minutes')::interval`,
    [ip, String(CLAIM_WINDOW_MIN)],
  );
  return Number(rows[0].count) >= CLAIM_MAX_FAILURES;
}

/**
 * 코드를 써서 이 기기를 기존 프로필에 붙인다.
 * 시크릿을 회전시키지 않고 **새 기기 행을 추가**하므로 원래 기기도 계속 동작한다.
 */
export async function claimLink(
  rawCode: string,
  ip: string,
): Promise<ApiResult<{ profileId: string; secret: string }>> {
  if (await isRateLimited(ip)) {
    return fail(429, 'rate_limited', '시도가 너무 많습니다. 잠시 후 다시 시도하세요');
  }

  const code = normalizeLinkCode(rawCode);
  if (code.length !== 8) {
    await recordFailure(ip);
    return fail(400, 'bad_code', '코드 형식이 올바르지 않습니다');
  }

  // 풀이 max:1 이라 트랜잭션 안에서 실패를 기록할 수 없다 — 커넥션을 놓은 뒤에 남긴다.
  const claimed = await withTransaction(async (client) => {
    // 단일 사용 보장: used_at 이 비어 있고 만료 전인 행만 원자적으로 집는다.
    const { rows } = await client.query<{ profile_id: string }>(
      `update link_codes
          set used_at = now()
        where code_hash = $1 and used_at is null and expires_at > now()
        returning profile_id`,
      [sha256(code)],
    );
    if (!rows[0]) return null;

    const secret = newSecret();
    await client.query(
      `insert into profile_devices (secret_hash, profile_id, last_seen_at)
       values ($1, $2, now())`,
      [sha256(secret), rows[0].profile_id],
    );
    return { profileId: rows[0].profile_id, secret };
  });

  if (!claimed) {
    await recordFailure(ip);
    return fail(404, 'bad_code', '코드가 없거나 만료되었습니다');
  }
  return ok(claimed);
}
