/**
 * 화면 감성 파라미터.
 * ⚠️ 최종값 미확정 (02 문서 8장 / 07 문서 4장) — 프로토타입 튜닝 패널에서
 * 프리셋 A/B/C 중 확정한 뒤 DEFAULT를 그 JSON으로 고정할 것.
 * 아래 값은 프로토타입 v0.7의 기본 P 객체를 그대로 옮긴 것이다.
 */
import { CAMERA } from './render';

export interface PostFxParams {
  grain: number;
  scan: number;
  vign: number;
  chroma: number;
  blockAmt: number;
  blockRate: number;
  ghost: number;
  freezeAmt: number;
  jitter: number;
  rolling: number;
  jello: number;
  motionSmear: number;
  dropRate: number;
  falloff: number;
  contrast: number;
  distort: number;
  mblur: number;
  fov: number;
}

export const DEFAULT: PostFxParams = {
  grain: 0.1,
  scan: 0.09,
  vign: 1.0,
  chroma: 0.35,
  blockAmt: 0.55,
  blockRate: 7.0,
  ghost: 0.45,
  freezeAmt: 0.6,
  jitter: 0.55,
  rolling: 0.09,
  jello: 0.55,
  motionSmear: 0.4,
  dropRate: 0.4,
  falloff: 1.0,
  contrast: 1.0,
  // ⚠️ 셰이더와 표적 오버레이가 **같은 값**을 봐야 한다 (07 문서 2.4).
  // 여기서 CAMERA.DISTORT 를 참조해 기본값의 출처를 하나로 묶는다.
  distort: CAMERA.DISTORT,
  mblur: 0.45,
  fov: CAMERA.FOV,
};

export const PRESETS: Record<string, PostFxParams> = {
  'A 아날로그': {
    grain: 0.22, scan: 0.16, vign: 1.15, chroma: 0.1, blockAmt: 0.1, blockRate: 5, ghost: 0.15,
    freezeAmt: 0.15, jitter: 1.0, rolling: 0.16, jello: 0.75, motionSmear: 0.25, dropRate: 0.55,
    falloff: 1.0, contrast: 0.95, distort: CAMERA.DISTORT, mblur: 0.45, fov: CAMERA.FOV,
  },
  'B 디지털': {
    grain: 0.06, scan: 0.04, vign: 0.85, chroma: 0.45, blockAmt: 0.85, blockRate: 8, ghost: 0.7,
    freezeAmt: 0.85, jitter: 0.25, rolling: 0.03, jello: 0.35, motionSmear: 0.55, dropRate: 0.3,
    falloff: 1.0, contrast: 1.05, distort: CAMERA.DISTORT, mblur: 0.45, fov: CAMERA.FOV,
  },
  'C 혼합': { ...DEFAULT },
};
