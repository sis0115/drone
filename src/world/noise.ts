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

/**
 * 배치용 난수 — **시드 고정**. `Math.random()` 을 쓰면 새로고침마다 맵이 달라진다.
 *
 * mulberry32: 32비트 상태 한 개, 4줄. 통계 품질은 배치용으로 충분하고
 * 무엇보다 **같은 시드 → 같은 맵**이 보장된다.
 * 화면 연출용 난수(신호 붕괴 리듬 등)는 여기 오지 않는다 — 그쪽은 매번 달라야 한다.
 */
let _state = 0;

export function seedWorld(seed: number): void {
  _state = seed >>> 0;
}

/** 0 이상 1 미만. `rnd` 와 배치 코드가 공유하는 유일한 난수원이다. */
export function random(): number {
  _state = (_state + 0x6d2b79f5) >>> 0;
  let t = _state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rnd = (a: number, b: number): number => a + random() * (b - a);
