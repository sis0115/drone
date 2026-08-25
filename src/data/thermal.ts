/**
 * 열화상 열값 테이블 — 02 문서 4.4 (06 문서 1.1 실측 기반).
 * 셰이더 밝기 리맵이 아니라 **머티리얼 스왑**용 값이다 (07 문서 2.3).
 * 0 = 차가움(검정) · 1 = 백열.
 */
export const HEAT = {
  sky: 0.03,
  water: 0.11,
  grass: 0.4,
  bush: 0.3,
  canopy: 0.34,
  trunk: 0.42,
  rock: 0.52,
  road: 0.5,
  ground: 0.62,
  pylon: 0.62,
  wall: 0.74,
  roof: 0.69,
  hay: 0.8,
  truckEngine: 0.98,
  truckBed: 0.6,
  truckWheel: 0.45,
} as const;

export type HeatKey = keyof typeof HEAT;
