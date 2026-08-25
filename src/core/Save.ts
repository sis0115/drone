/**
 * localStorage 저장. 05 문서 3장 PlayerProfile 스키마.
 * `schemaVersion` 필수 — 마이그레이션 훅을 지금부터 뚫어 둔다.
 */
export const SCHEMA_VERSION = 1;
const KEY = 'slfpv.save.v1';
const BACKUP_KEY = 'slfpv.save.v1.bak';

export interface Loadout {
  frame: string;
  camera: string;
  power: string;
  link: string;
  payloads: string[];
}

export interface PlayerProfile {
  schemaVersion: number;
  sp: number;
  trustTier: number;
  trustProgress: number;
  ownedFrames: string[];
  ownedModules: string[];
  payloadInventory: Record<string, number>;
  loadout: Loadout;
  campaign: Record<string, { stars: number; cleared: boolean }>;
  settings: { lang: string; stickMode: number; assist: string; haptics: boolean };
  stats: {
    totalKills: number;
    confirmedKills: number;
    framesLost: number;
    flightTimeSec: number;
  };
}

export function defaultProfile(): PlayerProfile {
  return {
    schemaVersion: SCHEMA_VERSION,
    sp: 0,
    trustTier: 1,
    trustProgress: 0,
    ownedFrames: ['frame.sparrow7'],
    ownedModules: ['cam.analogBw', 'pwr.basic', 'lnk.basic'],
    payloadInventory: {},
    loadout: {
      frame: 'frame.sparrow7',
      camera: 'cam.analogBw',
      power: 'pwr.basic',
      link: 'lnk.basic',
      payloads: [],
    },
    campaign: {},
    settings: { lang: 'ko', stickMode: 2, assist: 'full', haptics: true },
    stats: { totalKills: 0, confirmedKills: 0, framesLost: 0, flightTimeSec: 0 },
  };
}

/** 구 스키마를 현재 버전으로 끌어올린다. 버전이 올라갈 때마다 단계를 추가한다. */
function migrate(raw: PlayerProfile): PlayerProfile {
  const profile = { ...defaultProfile(), ...raw };
  profile.schemaVersion = SCHEMA_VERSION;
  return profile;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 사생활 보호 모드 등에서 접근 자체가 던진다.
    return null;
  }
}

export function load(): PlayerProfile {
  const store = storage();
  if (!store) return defaultProfile();
  for (const key of [KEY, BACKUP_KEY]) {
    const text = store.getItem(key);
    if (!text) continue;
    try {
      return migrate(JSON.parse(text) as PlayerProfile);
    } catch {
      // 손상된 슬롯은 건너뛰고 백업을 시도한다.
    }
  }
  return defaultProfile();
}

export function save(profile: PlayerProfile): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const previous = store.getItem(KEY);
    if (previous) store.setItem(BACKUP_KEY, previous);
    store.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function wipe(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(KEY);
  store.removeItem(BACKUP_KEY);
}
