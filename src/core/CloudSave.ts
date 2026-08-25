import { SCHEMA_VERSION, type PlayerProfile } from './Save';

/**
 * 계정 없는 클라우드 세이브 클라이언트.
 *
 * 신원은 서버가 발급한 기기별 시크릿 하나뿐이다 — 로그인 화면이 없다.
 * (04 문서 금지 목록상 OAuth 버튼은 톤에 맞지 않는다.)
 * 다른 기기는 **이어하기 코드**로 같은 프로필에 붙는다.
 *
 * 로컬 저장이 계속 게임플레이의 원본이다. 클라우드는 그 위에 얹은 동기화 계층이며,
 * 오프라인이거나 서버가 죽어도 게임은 그대로 돌아가야 한다.
 */

const CRED_KEY = 'slfpv.cloud.v1';
/** 충돌에서 밀려난 쪽을 버리지 않고 남겨 둔다. */
const LOSER_KEY = 'slfpv.cloud.conflict.v1';

export interface Credential {
  profileId: string;
  secret: string;
  /** 마지막으로 서버와 맞춘 리비전. push 의 baseRev 로 쓴다. */
  rev: number;
}

export type SyncStatus =
  | { kind: 'disabled' }
  | { kind: 'synced'; rev: number }
  | { kind: 'conflict'; kept: 'local' | 'cloud'; rev: number }
  | { kind: 'offline' }
  | { kind: 'outdated' }
  | { kind: 'error'; message: string };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCredential(): Credential | null {
  const raw = storage()?.getItem(CRED_KEY);
  if (!raw) return null;
  try {
    const cred = JSON.parse(raw) as Credential;
    return cred.secret ? cred : null;
  } catch {
    return null;
  }
}

function saveCredential(cred: Credential): void {
  storage()?.setItem(CRED_KEY, JSON.stringify(cred));
}

export function clearCredential(): void {
  storage()?.removeItem(CRED_KEY);
}

export function isEnabled(): boolean {
  return loadCredential() !== null;
}

/** 충돌에서 밀려난 프로필. 사용자가 되돌리고 싶을 때를 위해 남긴다. */
export function conflictBackup(): PlayerProfile | null {
  const raw = storage()?.getItem(LOSER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerProfile;
  } catch {
    return null;
  }
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(res.status, String(body.error ?? 'unknown'), String(body.message ?? res.statusText));
  }
  return body as T;
}

/**
 * 진행도 점수. 충돌 시 어느 쪽을 남길지 정하는 기준이다.
 * 비행 시간은 단조 증가라 되감기지 않으므로 1순위로 쓴다.
 */
function progress(p: PlayerProfile): number {
  const s = p.stats;
  return (s?.flightTimeSec ?? 0) * 1000 + (s?.totalKills ?? 0) * 10 + (p.sp ?? 0);
}

/** 최초 활성화. 지금 로컬 프로필을 그대로 클라우드에 올린다. */
export async function enable(local: PlayerProfile): Promise<Credential> {
  const existing = loadCredential();
  if (existing) return existing;

  const res = await post<{ profileId: string; secret: string; rev: number }>('/api/profile/create', {
    data: local,
    schemaVersion: SCHEMA_VERSION,
  });
  const cred: Credential = { profileId: res.profileId, secret: res.secret, rev: res.rev };
  saveCredential(cred);
  return cred;
}

/** 다른 기기에서 입력할 1회성 코드를 발급받는다. */
export async function createLinkCode(): Promise<{ code: string; expiresAt: string }> {
  const cred = loadCredential();
  if (!cred) throw new Error('클라우드 세이브가 꺼져 있습니다');
  return post('/api/link/create', { secret: cred.secret });
}

/**
 * 코드를 써서 이 기기를 기존 프로필에 붙이고, 그 프로필을 내려받는다.
 * **이 기기의 로컬 진행은 덮인다** — 호출 전에 사용자 확인을 받을 것.
 */
export async function claimLinkCode(code: string): Promise<PlayerProfile> {
  const claimed = await post<{ profileId: string; secret: string }>('/api/link/claim', { code });
  const pulled = await post<{ rev: number; schemaVersion: number; data: PlayerProfile }>(
    '/api/profile/pull',
    { secret: claimed.secret },
  );
  saveCredential({ profileId: claimed.profileId, secret: claimed.secret, rev: pulled.rev });
  return pulled.data;
}

/**
 * 로컬 프로필을 서버와 맞춘다. 돌려주는 프로필이 이후 진짜 값이다.
 *
 * 충돌(409)은 두 기기가 각자 진행한 경우다. 진행도가 큰 쪽을 남기고,
 * 밀려난 쪽은 버리지 않고 로컬 백업 키에 넣는다.
 */
export async function sync(local: PlayerProfile): Promise<{ profile: PlayerProfile; status: SyncStatus }> {
  const cred = loadCredential();
  if (!cred) return { profile: local, status: { kind: 'disabled' } };

  try {
    const pushed = await post<{ rev: number }>('/api/profile/push', {
      secret: cred.secret,
      baseRev: cred.rev,
      data: local,
      schemaVersion: SCHEMA_VERSION,
    });
    saveCredential({ ...cred, rev: pushed.rev });
    return { profile: local, status: { kind: 'synced', rev: pushed.rev } };
  } catch (err) {
    if (!(err instanceof HttpError)) {
      // 네트워크 단절 — 로컬로 계속 간다. 다음 저장에서 다시 시도한다.
      return { profile: local, status: { kind: 'offline' } };
    }

    if (err.status === 409) {
      return resolveConflict(cred, local);
    }
    if (err.status === 401) {
      // 서버에서 기기가 사라졌다. 자격증명을 버리고 로컬 전용으로 떨어진다.
      clearCredential();
      return { profile: local, status: { kind: 'error', message: '기기 등록이 해제되었습니다' } };
    }
    return { profile: local, status: { kind: 'error', message: err.message } };
  }
}

async function resolveConflict(
  cred: Credential,
  local: PlayerProfile,
): Promise<{ profile: PlayerProfile; status: SyncStatus }> {
  const server = await post<{ rev: number; schemaVersion: number; data: PlayerProfile }>(
    '/api/profile/pull',
    { secret: cred.secret },
  );

  // 서버 쪽이 더 새 스키마면 이 클라이언트는 안전하게 병합할 수 없다.
  if (server.schemaVersion > SCHEMA_VERSION) {
    return { profile: local, status: { kind: 'outdated' } };
  }

  const keepLocal = progress(local) > progress(server.data);
  const winner = keepLocal ? local : server.data;
  const loser = keepLocal ? server.data : local;
  storage()?.setItem(LOSER_KEY, JSON.stringify(loser));

  if (keepLocal) {
    // 로컬이 이겼으니 서버 rev 를 기준으로 다시 올린다.
    const pushed = await post<{ rev: number }>('/api/profile/push', {
      secret: cred.secret,
      baseRev: server.rev,
      data: local,
      schemaVersion: SCHEMA_VERSION,
    });
    saveCredential({ ...cred, rev: pushed.rev });
    return { profile: local, status: { kind: 'conflict', kept: 'local', rev: pushed.rev } };
  }

  saveCredential({ ...cred, rev: server.rev });
  return { profile: winner, status: { kind: 'conflict', kept: 'cloud', rev: server.rev } };
}
