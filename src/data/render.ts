/** 카메라·렌더 상수 — 02 문서 4.3. 임의 변경 금지. */

/**
 * 내부 렌더 해상도. 화면에는 업스케일해서 띄운다.
 *
 * 아트 패스 3 (DEVLOG 2026-08-26): 480×270 단일 고정 → **화질 프리셋 2단**.
 * 실기 플레이 피드백 — "화질이 안 좋아서 게임 플레이에 집중이 안 된다".
 * 컨셉(저화질 FPV)은 '아날로그' 프리셋으로 보존하고, 기본은 2배 해상도로 올린다.
 * 화질 열화는 **상시 필터가 아니라 신호 상태의 정보**다 — 신호가 좋으면 깨끗해야 한다.
 */
export const VIDEO_PRESETS = {
  /** 기본 — 지금 세대 디지털 링크의 화질 */
  standard: { w: 960, h: 540 },
  /** 원 컨셉 — 아날로그 480p. 프로토타입 검증 해상도 */
  analog: { w: 480, h: 270 },
} as const;
export type VideoQuality = keyof typeof VIDEO_PRESETS;

/** 프로토타입 검증 해상도 (02 문서 4.3). 헤드리스 도구·비교 기준은 이 값을 쓴다. */
export const RT_W = 480;
export const RT_H = 270;

export const CAMERA = {
  FOV: 118,
  NEAR: 0.3,
  FAR: 1600,
  /** 배럴 왜곡 계수. 오버레이 좌표에 역변환을 동일하게 적용해야 한다 (07 문서 2.4). */
  DISTORT: 0.26,
} as const;

/**
 * 안개 — 아트 패스 1 에서 색(0xa8b5ac→0xa6a99c), 아트 패스 3 에서 거리(60/540→150/950).
 * (DEVLOG 2026-08-26 두 건. 프로토타입 원값 60/540)
 *
 * 근거: 480p 시절엔 상시 노이즈가 안개면을 가려 줬지만, 화질을 올리자
 * 60m 부터 시작하는 안개가 화면 하단 절반(FOV 118°에서 100m+ 지면)을
 * 민낯의 우유빛으로 만들었다 — 실기 피드백 "배경 실사화"의 실체가 이것이다.
 * 흐린 날에도 100m 는 선명하다. 원경을 그리는 비용은 frustum(FAR 1600) 안이라 동일.
 */
export const FOG = { color: 0xa6a99c, near: 150, far: 950 } as const;

export const SIGNAL = {
  /** 이 거리부터 감쇠 시작 (m) */
  falloffStart_m: 160,
  /** LOS 차폐 시 감산 */
  losBlocked: -0.55,
  /** 재밍 시 감산 */
  jammed: -0.45,
} as const;

/** 성능 예산 — 02 문서 5장. tools/perf.js 가 이 값으로 판정한다. */
export const BUDGET = {
  drawCalls: 120,
  triangles: 300_000,
  minFps: 45,
  targetFps: 60,
} as const;

/**
 * 배럴 왜곡의 **역변환** — 표적 오버레이 좌표 보정 (07 문서 2.4).
 *
 * 셰이더는 화면 좌표 s 에서 RT 의 `s·(1 + k|s|²)` 지점을 읽는다.
 * 따라서 RT 상 위치 t 에 있는 표적은 화면에서 `s = f⁻¹(t)` 에 보인다.
 *
 * 프로토타입은 이걸 1차 근사 `t·(1 - k|t|²)` 로 처리했는데,
 * **화면 가장자리에서 왕복 오차가 2.35% 까지 벌어진다**(실측) — 락온 박스가 표적을 벗어난다.
 * 여기서는 뉴턴법 2회로 정확히 푼다. 표적 몇 개 × 프레임이라 비용은 무시할 수준.
 *
 * 반경 방정식: ρ(1 + kρ²) = τ  (ρ = |화면|, τ = |RT|)
 */
export function undistort(x: number, y: number, k: number = CAMERA.DISTORT): [number, number] {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const tau = Math.hypot(cx, cy);
  if (tau < 1e-9 || k === 0) return [x, y];

  // 1차 근사에서 출발해 두 번 다듬는다.
  let rho = tau * (1 - k * tau * tau);
  for (let i = 0; i < 2; i++) {
    const g = rho + k * rho * rho * rho - tau;
    const dg = 1 + 3 * k * rho * rho;
    rho -= g / dg;
  }

  const scale = rho / tau;
  return [0.5 + cx * scale, 0.5 + cy * scale];
}

export function distort(x: number, y: number, k: number = CAMERA.DISTORT): [number, number] {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const r2 = cx * cx + cy * cy;
  const s = 1 + k * r2;
  return [0.5 + cx * s, 0.5 + cy * s];
}
