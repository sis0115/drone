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
  /** 프롤로그를 봤는가 — 타이틀에서 스토리/작전실 분기 */
  introSeen: boolean;
  sp: number;
  trustTier: number;
  trustProgress: number;
  ownedFrames: string[];
  ownedModules: string[];
  payloadInventory: Record<string, number>;
  loadout: Loadout;
  campaign: Record<string, { stars: number; cleared: boolean }>;
  settings: { lang: string; stickMode: number; assist: string; haptics: boolean; video: string };
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
    introSeen: false,
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
    settings: { lang: 'ko', stickMode: 2, assist: 'full', haptics: true, video: 'standard' },
    stats: { totalKills: 0, confirmedKills: 0, framesLost: 0, flightTimeSec: 0 },
  };
}

/** 구 스키마를 현재 버전으로 끌어올린다. 버전이 올라갈 때마다 단계를 추가한다. */
function migrate(raw: PlayerProfile): PlayerProfile {
  const base = defaultProfile();
  const profile = { ...base, ...raw };
  // 중첩 객체는 스프레드가 통째로 덮는다 — 새 필드(video 등)는 안쪽에서 다시 채운다
  profile.settings = { ...base.settings, ...raw.settings };
  profile.stats = { ...base.stats, ...raw.stats };
  profile.schemaVersion = SCHEMA_VERSION;
  return profile;
}

import { platform } from '@/platform';

/**
 * 저장 통로는 `platform.storage` 하나다 (CLAUDE.md 규칙 10).
 * T1 구현이 `localStorage` 를 직접 만졌다 — platform 계층(구조화)보다 먼저 쓰인
 * 코드라 규칙 위반이 숨어 있었고, T9 에서 통로를 좁혔다. 모바일 이식 때
 * Preferences 로 갈아끼우면 이 파일은 한 줄도 안 바뀐다.
 */
export function load(): PlayerProfile {
  const store = platform().storage;
  for (const key of [KEY, BACKUP_KEY]) {
    const text = store.get(key);
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
  const store = platform().storage;
  const previous = store.get(KEY);
  if (previous) store.set(BACKUP_KEY, previous);
  return store.set(KEY, JSON.stringify(profile));
}

export function wipe(): void {
  const store = platform().storage;
  store.remove(KEY);
  store.remove(BACKUP_KEY);
}
