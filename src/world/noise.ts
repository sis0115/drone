/**
 * 프로시저럴 노이즈 — 프로토타입 v0.7 에서 그대로 옮긴 것.
 * 지형 높이·텍스처·배치가 전부 이 세 함수 위에 서 있으므로
 * **계수를 바꾸면 지형이 통째로 달라진다.** 임의 변경 금지.
 */

export function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** fBm 다중 옥타브. 옥타브마다 주파수 2.07배, 진폭 절반. */
export function fbm(x: number, y: number, oct: number): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, y * f) * amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return v;
}

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
