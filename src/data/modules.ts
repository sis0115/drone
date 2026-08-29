/**
 * 모듈 — 05 문서 2.2 ModuleDef / 4.3 가격표.
 *
 * **카메라는 원래 사는 것이다.** GDD 6.5 진행 루프가 "열화상 구매 → 캠페인 돌파 →
 * 신뢰도 상승"이고, 6.4 카메라 사다리가 "아날로그 흑백 480p → 아날로그 컬러 →
 * 디지털 HD → 열화상 레드아이"다. 세이브 스키마의 시작 모듈도 `cam.analogBw` 하나였다 —
 * 그런데 코드는 세 모드를 전부 공짜로 열어 뒀다. 그 이탈을 되돌린다.
 *
 * 모듈은 **잃지 않는다**(기체만 소모된다) — 그래서 손실 페널티가 없고,
 * 자폭 드론 게임에서 가장 먼저 사게 되는 물건이 된다.
 */

/** `core/GameState` 의 CamMode 와 같은 값. 계층 규칙상 data 는 core 를 부르지 않는다. */
export type ModuleCamMode = 'bw' | 'color' | 'thermal';

export interface ModuleDef {
  id: string;
  slot: 'camera' | 'power' | 'link';
  tier: number;
  nameKey: string;
  descKey: string;
  statKey: string;
  priceSp: number;
  /** 카메라 모듈이 여는 화면 모드 */
  camMode?: ModuleCamMode;
}

/** 05 문서 4.3: T1 모듈 200~400(아날로그 컬러 300) / T3 열화상 1,800. 문서값 그대로. */
export const MODULES: readonly ModuleDef[] = [
  {
    id: 'cam.analogBw',
    slot: 'camera',
    tier: 1,
    nameKey: 'module.cam.analogBw.name',
    descKey: 'module.cam.analogBw.desc',
    statKey: 'module.cam.analogBw.stat',
    priceSp: 0, // 기본 지급
    camMode: 'bw',
  },
  {
    id: 'cam.analogColor',
    slot: 'camera',
    tier: 1,
    nameKey: 'module.cam.analogColor.name',
    descKey: 'module.cam.analogColor.desc',
    statKey: 'module.cam.analogColor.stat',
    priceSp: 300,
    camMode: 'color',
  },
  {
    id: 'cam.thermal',
    slot: 'camera',
    tier: 3,
    nameKey: 'module.cam.thermal.name',
    descKey: 'module.cam.thermal.desc',
    statKey: 'module.cam.thermal.stat',
    priceSp: 1800,
    camMode: 'thermal',
  },
] as const;

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

/** 카메라 모듈만 — 격납고가 슬롯별로 묶어 보여 준다. */
export const CAMERA_MODULES = MODULES.filter((m) => m.slot === 'camera');

/**
 * 소유 모듈이 여는 화면 모드 목록. 순서는 사다리 순서(흑백→컬러→열화상)를 지킨다 —
 * 비행 중 전환 버튼이 이 순서로 돈다.
 */
export function camModesOwned(ownedModules: readonly string[]): ModuleCamMode[] {
  const modes: ModuleCamMode[] = [];
  for (const m of CAMERA_MODULES) {
    if (m.camMode && ownedModules.includes(m.id)) modes.push(m.camMode);
  }
  return modes.length ? modes : ['bw']; // 최소 한 칸은 열려 있어야 화면이 나온다
}
