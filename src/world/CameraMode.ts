import type { World } from './SceneBuilder';
import { DAYLIGHT } from '@/data/atmosphere';
import type { CamMode } from '@/core/GameState';

/**
 * 카메라 모드 — 아날로그 흑백 / 주간 컬러 / 열화상.
 *
 * **열화상은 셰이더 밝기 리맵이 아니다** (07 문서 2.3).
 * 셰이더 리맵으로는 "하늘 흑 / 물 흑 / 지면 명 / 열원 백열"의 4단 구조가 나오지 않는다.
 * 오브젝트마다 열값을 부여해 두고(T2 의 `ThermalRegistry`) 모드 전환 때 **머티리얼을 교체**한다.
 *
 * 머티리얼만으로는 부족한 것들 — 하늘·안개·조명 — 도 여기서 함께 바꾼다.
 * 하늘돔은 ShaderMaterial 이라 열값 등록 대상이 아니고,
 * 안개색이 주간 그대로면 원경이 푸르게 남아 열화상처럼 보이지 않는다.
 */

/** 셰이더 `uThermal` 분기 값. 0=흑백 / 1=주간 컬러 / 2=열화상 */
export const THERMAL_UNIFORM: Record<CamMode, number> = {
  bw: 0,
  color: 1,
  thermal: 2,
};

/** HUD 에 찍히는 짧은 표기 (라벨 없는 기술 토큰 — 06 문서 원칙 ⑤). */
export const CAM_MODE_LABEL: Record<CamMode, string> = {
  bw: 'BW',
  color: 'COLOR',
  thermal: 'THRM',
};

export const CAM_MODE_ORDER: CamMode[] = ['bw', 'color', 'thermal'];

export function nextCamMode(current: CamMode): CamMode {
  const i = CAM_MODE_ORDER.indexOf(current);
  return CAM_MODE_ORDER[(i + 1) % CAM_MODE_ORDER.length];
}

const LOOK = {
  thermal: {
    skyTop: 0x050607, // 상단 1/3 이 거의 순흑 — 열화상의 시그니처 (06 문서 1.1)
    skyHorizon: 0x59605c, // 지평선 대기층은 밝은 띠
    fog: 0x2a2f2c,
    hemi: 0.9,
    sun: 0.7,
    sunColor: 0xffffff,
  },
  daylight: {
    skyTop: DAYLIGHT.skyTop,
    skyHorizon: DAYLIGHT.skyHorizon,
    fog: DAYLIGHT.fog,
    hemi: 1.05,
    sun: 1.15,
    sunColor: DAYLIGHT.sunColor,
  },
} as const;

/**
 * 조명 강도 보정 — three r155 부터 물리 단위라 r128 대비 약 π배 어둡다.
 * `SceneBuilder` 의 LIGHT_SCALE 과 같은 이유이며 값도 같아야 한다.
 */
const LIGHT_SCALE = Math.PI;

export function applyCameraMode(world: World, mode: CamMode): void {
  const thermal = mode === 'thermal';
  world.registry.setThermal(thermal);

  const look = thermal ? LOOK.thermal : LOOK.daylight;
  world.sky.setColors(look.skyTop, look.skyHorizon);
  world.fog.color.setHex(look.fog);
  world.hemi.intensity = look.hemi * LIGHT_SCALE;
  world.sun.intensity = look.sun * LIGHT_SCALE;
  world.sun.color.setHex(look.sunColor);
}
