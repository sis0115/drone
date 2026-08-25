/** 카메라·렌더 상수 — 02 문서 4.3. 임의 변경 금지. */

/** 내부 렌더 해상도 고정. 화면에는 업스케일해서 띄운다. */
export const RT_W = 480;
export const RT_H = 270;

export const CAMERA = {
  FOV: 118,
  NEAR: 0.1,
  FAR: 1200,
  /** 배럴 왜곡 계수. 오버레이 좌표에 역변환을 동일하게 적용해야 한다 (07 문서 2.4). */
  DISTORT: 0.26,
} as const;

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
 * 배럴 왜곡: 셰이더는 uv = 0.5 + c*(1 + k*r²) 로 밀고,
 * SVG 오버레이는 아래 역변환으로 당겨야 마커가 표적에 붙는다.
 * 둘 중 하나만 고치면 즉시 어긋난다 (07 문서 2.4).
 */
export function undistort(x: number, y: number, k: number = CAMERA.DISTORT): [number, number] {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const r2 = cx * cx + cy * cy;
  const s = 1 - k * r2;
  return [0.5 + cx * s, 0.5 + cy * s];
}

export function distort(x: number, y: number, k: number = CAMERA.DISTORT): [number, number] {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const r2 = cx * cx + cy * cy;
  const s = 1 + k * r2;
  return [0.5 + cx * s, 0.5 + cy * s];
}
