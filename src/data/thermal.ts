/**
 * 열화상 열값 테이블 — 02 문서 4.4 (06 문서 1.1 실측 기반).
 * 셰이더 밝기 리맵이 아니라 **머티리얼 스왑**용 값이다 (07 문서 2.3).
 * 0 = 차가움(검정) · 1 = 백열.
 *
 * 열값은 **여기가 유일한 출처다**(CLAUDE.md 규칙 6). `world/` 에 숫자를 흩뿌리면
 * 4단 구조가 언제 깨졌는지 추적할 수 없다 — 실제로 AO 패치가 등록 때 색을 빠뜨려
 * 백열(1.0)로 떠 있었고, 테이블 밖 값이라 아무도 몰랐다(DEVLOG 2026-08-26).
 */
export const HEAT = {
  // 차가움 — 하늘·물
  sky: 0.03,
  water: 0.11,
  // 식생·그늘
  bush: 0.3,
  shade: 0.3,
  canopy: 0.34,
  grass: 0.4,
  trunk: 0.42,
  log: 0.44,
  deadwood: 0.46,
  // 지면·구조물
  road: 0.5,
  pole: 0.5,
  rock: 0.52,
  silo: 0.56,
  ground: 0.62,
  pylon: 0.62,
  pad: 0.66,
  dirt: 0.66,
  roof: 0.68,
  roofMetal: 0.7,
  rail: 0.72,
  rubble: 0.72,
  wall: 0.74,
  chimney: 0.78,
  hay: 0.8,
  // 열원 — 여기만 백열이어야 한다
  truckWheel: 0.45,
  truckBed: 0.6,
  truckEngine: 0.98,
} as const;

export type HeatKey = keyof typeof HEAT;
