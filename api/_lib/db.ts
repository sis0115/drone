import { Pool, type PoolClient } from 'pg';
import { SCHEMA_SQL } from './schema';

let pool: Pool | null = null;

/**
 * Vercel 함수는 인스턴스마다 살아났다 죽으므로 커넥션을 크게 잡으면 금방 고갈된다.
 * Neon 은 **pooled 연결 문자열**(호스트에 `-pooler` 가 붙은 것)을 써야 한다.
 */
export function db(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 미설정 — Vercel Storage 연결 또는 로컬 .env 확인');
  }

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    // 로컬 테스트 클러스터는 TLS 를 쓰지 않는다. 원격은 검증을 끄지 않는다.
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });
  return pool;
}

/**
 * 트랜잭션 한 단위. 서버리스라 풀이 `max: 1` 이므로
 * **콜백 안에서 db().query() 를 부르면 자기 자신을 기다리며 멈춘다.**
 * 반드시 넘겨받은 client 로만 질의할 것.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** 테스트에서 커넥션을 정리할 때 쓴다. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

let migrated = false;

/**
 * 스키마를 적용한다. 전부 `if not exists` 라 여러 번 돌려도 안전하다.
 * SQL 을 파일이 아니라 코드로 들고 있는 이유는 schema.ts 주석 참조.
 */
export async function migrate(force = false): Promise<void> {
  if (migrated && !force) return;
  await db().query(SCHEMA_SQL);
  migrated = true;
}
