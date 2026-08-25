/**
 * 검증된 물리 상수 — 02 문서 4.1 / 4.2.
 * ⚠️ 임의 변경 금지. 바꿔야 하면 근거 수치와 함께 DEVLOG.md에 기록할 것.
 */

/** 프로 모드 (실물리, 기울기 기반). 실측: 호버 10초 드리프트 0.0000m, 최고속도 73.8km/h */
export const PRO = {
  MASS: 1.2,
  G: 9.81,
  MAX_THRUST: 35,
  MAX_TILT: (32 * Math.PI) / 180,
  TILT_RESP: 6.0,
  MAX_VS: 4.0,
  VS_KP: 3.2,
  YAW_RATE: 2.1,
  DRAG_H: 0.28,
  DRAG_V: 0.25,
} as const;

/** 아케이드 모드 (기본값, 속도 기반 + 지형 자동 추종). 실측: 전진 3초 79.2km/h, 고도 오차 0.08m */
export const ARCADE = {
  spd: 22,
  acc: 3.2,
  turn: 2.0,
  strafe: 11,
  climb: 14,
  aglMin: 4,
  aglMax: 140,
  /** 지형 고도 추종 게인 / 응답 */
  aglGain: 2.4,
  aglResp: 5.0,
  /** 장애물 충돌: 이 속도 미만이면 밀려나고, 이상이면 격추 */
  crashSpeed: 16,
} as const;

/** 표적 판정 반경 (m) */
export const HIT_RADIUS = { arcade: 7.0, pro: 4.2 } as const;

/** 하네스·테스트가 회귀를 잡는 기준선. 02 문서 4.1/4.2 실측치. */
export const VERIFIED = {
  pro: { hoverDrift10s_m: 0.0, topSpeed_kmh: 73.8 },
  arcade: { forward3s_kmh: 79.2, aglError_m: 0.08, turn1s_deg: 115 },
} as const;
