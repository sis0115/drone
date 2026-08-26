import * as THREE from 'three';
import { ThermalRegistry } from './ThermalRegistry';
import { createSkyDome } from './SkyDome';
import { buildTerrain, terrainH, type TerrainHandles } from './Terrain';
import { FOG } from '@/data/render';
import { buildVegetation, type VegetationHandles } from './Vegetation';
import { buildProps, type PropHandles } from './Props';
import { AoCollector } from './Ao';
import type { Obstacle } from './Props';

/**
 * 씬 조립 단일 진입점.
 *
 * 프로토타입은 즉시 실행 코드로 씬을 만들었다. 여기서는 순수 함수로 바꿔
 * **브라우저 없이도 씬을 만들 수 있게** 했다 — `tools/scene-check.mjs` 가 이걸 불러
 * 드로우콜 예산을 잰다. 렌더러에 의존하지 말 것.
 */
export interface World {
  scene: THREE.Scene;
  registry: ThermalRegistry;
  terrain: TerrainHandles;
  vegetation: VegetationHandles;
  props: PropHandles;
  /** LOS 차폐·충돌 판정 대상 (건물·연료탱크·송전탑) */
  obstacles: Obstacle[];
  /** 드론을 따라다녀야 하는 태양 (섀도우 카메라가 ±110m 뿐이다) */
  sun: THREE.DirectionalLight;
  heightAt(x: number, z: number): number;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  const registry = new ThermalRegistry();

  scene.add(createSkyDome());
  addAmbient(scene);

  const sun = addSun(scene);

  const terrain = buildTerrain(scene, registry);

  // AO 패치는 나무·건물이 각자 쌓아 두고 **마지막에 한 번** 1콜로 굽는다.
  const ao = new AoCollector();
  const props = buildProps(scene, registry, ao);
  const vegetation = buildVegetation(scene, registry, ao);
  ao.build(scene, registry);

  return {
    scene,
    registry,
    terrain,
    vegetation,
    props,
    sun,
    obstacles: props.obstacles,
    heightAt: terrainH,
  };
}

/**
 * 조명 — 색·강도·위치 전부 프로토타입 실측값.
 *
 * ⚠️ `LIGHT_SCALE`: three r155 부터 조명이 물리 단위로 바뀌어(useLegacyLights 제거)
 * 같은 intensity 가 r128 대비 약 π배 어둡다. 프로토타입 룩이 검증 기준이므로 보정한다.
 * 정식 물리 조명으로 갈 거라면 후처리 파라미터를 함께 다시 잡아야 한다.
 */
const LIGHT_SCALE = Math.PI;

function addAmbient(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xbcd4e6, 0x4a5236, 1.05 * LIGHT_SCALE));
}

function addSun(scene: THREE.Scene): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.25 * LIGHT_SCALE);
  sun.position.set(-70, 100, 50);
  sun.castShadow = true;
  // 1024 는 프로토타입에서 검증된 값이다. 2048 로 올리면 그림자 맵 픽셀이 4배가 된다.
  sun.shadow.mapSize.set(1024, 1024);
  // 드론을 따라다니는 섀도우 카메라. ±110m 밖은 그림자를 포기한다.
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 340;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}
