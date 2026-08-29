import { fbm } from './noise';
import { terrainH } from './Terrain';

/**
 * 토지 피복 — **식생이 어디에 자라는가**의 단일 출처.
 *
 * 이전 배치는 `rnd(-470, 470)` 균일 살포였다. 상공에서 보면 덤불 5,200개가
 * 전 지역에 똑같은 밀도로 깔려 **프로시저럴 노이즈**로 읽혔다(실측 스크린샷).
 * 실제 농지는 그 반대다 — **밭 안은 비어 있고, 경계에 산울타리가 선다.**
 * 그 구조가 "여기는 사람이 농사짓던 땅"이라는 정보를 만든다.
 *
 * 지면 텍스처·정점색이 쓰는 밭 구획 주파수(0.0026)를 그대로 쓴다 —
 * 그래야 초목의 열/닫힘이 땅의 색 구획과 **같은 자리에서** 일어난다.
 */

/**
 * **필지 격자.** 밭 구획을 fbm 으로 잡았더니 유기적인 얼룩이 나왔고,
 * 상공에서 "농지"가 아니라 "노이즈 텍스처"로 읽혔다(실측).
 * 사람이 나눈 땅은 **직선**이다 — 회전된 격자로 바꾼다.
 *
 * 도로(x=120, 남북)와 어긋난 각도를 준다. 격자가 도로와 나란하면
 * 화면 전체가 한 방향으로 줄서서 인공적으로 보인다.
 */
const PARCEL_M = 96;
const PARCEL_ROT = 0.38;
const COS_R = Math.cos(PARCEL_ROT);
const SIN_R = Math.sin(PARCEL_ROT);

export interface Parcel {
  /** 필지 좌표 */
  iu: number;
  iv: number;
  /** 필지 안에서의 위치 0~1 */
  fu: number;
  fv: number;
  /** 필지 고유값 0~1 — 색조·작물·휴경을 정한다 */
  id: number;
}

/** 정수 두 개 → 0~1 해시. 필지마다 안정적인 고유값이 필요하다(시드 난수와 별개). */
function hash2(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function parcelAt(x: number, z: number): Parcel {
  // 필지 경계를 살짝 흔든다 — 완벽한 격자는 논밭이 아니라 모눈종이다
  const wob = fbm(x * 0.0016 + 21, z * 0.0016 + 21, 2) * 26 - 13;
  const u = (x * COS_R - z * SIN_R + wob) / PARCEL_M;
  const v = (x * SIN_R + z * COS_R - wob) / PARCEL_M;
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  return { iu, iv, fu: u - iu, fv: v - iv, id: hash2(iu, iv) };
}

/** 지면 색조가 쓰는 필지 값 — 예전 `fieldValue` 를 대신한다. */
export function fieldValue(x: number, z: number): number {
  return parcelAt(x, z).id;
}

/**
 * 필지 경계와의 근접도 0~1 (1 = 경계 위).
 * 경계선이 곧 **산울타리·수로·농로**가 지나가는 자리다.
 *
 * 모든 경계에 산울타리를 세우면 격자무늬가 된다 — 필지 해시로 **절반쯤만** 세운다.
 */
export function hedgerow(x: number, z: number): number {
  const p = parcelAt(x, z);
  const du = Math.min(p.fu, 1 - p.fu);
  const dv = Math.min(p.fv, 1 - p.fv);
  // 이 필지의 u 변·v 변에 각각 산울타리가 있는가
  const hasU = hash2(p.iu * 2.3, p.iv * 5.1) > 0.42;
  const hasV = hash2(p.iu * 7.7, p.iv * 1.9) > 0.42;
  const edge = Math.min(hasU ? du : 1, hasV ? dv : 1);
  return Math.max(0, 1 - edge / 0.075);
}

/**
 * 이 좌표의 식생 밀도 0~1. 배치는 이 값으로 **기각 표집**한다.
 *
 * 셋을 겹친다:
 * - 산울타리(경계) — 가장 강한 항. 여기가 덤불이 몰리는 자리다
 * - 습기(저지대) — 물가로 갈수록 무성해진다
 * - 잡목림 덩어리 — 버려진 구획 하나가 통째로 덤불에 먹힌 곳
 */
export function vegDensity(x: number, z: number): number {
  const h = hedgerow(x, z);
  // 저지대일수록 축축하다. terrainH 는 -8 부근이 최저.
  const wet = Math.max(0, Math.min(1, (2 - terrainH(x, z)) / 9));
  // 버려진 구획 — 낮은 주파수로 드문드문. 여기는 밭 안쪽도 덤불이 찬다.
  const thicket = Math.max(0, (fbm(x * 0.0045 + 300, z * 0.0045 + 300, 3) - 0.62) * 4.2);
  // 밭 안쪽 기본값은 아주 낮게 — **비어 있는 것이 정보다**
  return Math.min(1, 0.05 + h * 0.95 + wet * 0.3 + thicket);
}

/**
 * 풀 밀도. 덤불과 반대로 **밭 안쪽에도 깔리되**, 갈아엎은 구획은 성글다.
 * 풀까지 경계에만 몰면 밭이 민둥땅이 된다.
 */
export function grassDensity(x: number, z: number): number {
  // 필지마다 갈아엎었거나(성글다) 묵혔거나(무성하다) — 이 대비가 농지를 농지로 만든다
  const rough = parcelAt(x, z).id < 0.45 ? 0.3 : 0.85;
  return Math.min(1, rough + hedgerow(x, z) * 0.5);
}

/**
 * 밀도에 따라 좌표를 고르는 기각 표집.
 * `tries` 안에 못 고르면 null — 호출자가 그 개체를 포기한다(밀도가 낮은 곳은 비어야 하므로).
 */
export function sampleByDensity(
  rnd: (a: number, b: number) => number,
  random: () => number,
  density: (x: number, z: number) => number,
  extent: number,
  tries = 12,
): { x: number; z: number } | null {
  for (let i = 0; i < tries; i++) {
    const x = rnd(-extent, extent);
    const z = rnd(-extent, extent);
    if (random() < density(x, z)) return { x, z };
  }
  return null;
}
