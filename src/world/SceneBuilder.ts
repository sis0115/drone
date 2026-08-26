import * as THREE from 'three';
import { ThermalRegistry } from './ThermalRegistry';
import { createSkyDome, type SkyDome } from './SkyDome';
import { buildTerrain, terrainH, type TerrainHandles } from './Terrain';
import { FOG } from '@/data/render';
import { WORLD_SEED } from '@/data/world';
import { DAYLIGHT } from '@/data/atmosphere';
import { buildVegetation, type VegetationHandles } from './Vegetation';
import { buildProps, type PropHandles } from './Props';
import { buildTargets, type Target } from './Targets';
import { AoCollector } from './Ao';
import { buildScars } from './Scars';
import { seedWorld } from './noise';
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
  /** 표적 — HUD 오버레이와 미션 판정이 읽는다 */
  targets: Target[];
  /** 카메라 모드 전환이 색을 갈아 끼운다 */
  sky: SkyDome;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  heightAt(x: number, z: number): number;
}

export function buildWorld(options: { seed?: number } = {}): World {
  // **가장 먼저** 시드를 세운다. 이 뒤로 나오는 배치 난수가 전부 여기에 매인다.
  // 시드가 없으면 새로고침마다 지형지물이 달라져 미션 설계도, 스크린샷 비교도 성립하지 않는다.
  seedWorld(options.seed ?? WORLD_SEED);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  scene.fog = fog;

  const registry = new ThermalRegistry();

  const sky = createSkyDome();
  scene.add(sky.mesh);
  const hemi = addAmbient(scene);

  const sun = addSun(scene);

  const terrain = buildTerrain(scene, registry);
  addHorizonSkirt(scene, registry);

  // AO 패치는 나무·건물이 각자 쌓아 두고 **마지막에 한 번** 1콜로 굽는다.
  const ao = new AoCollector();
  const props = buildProps(scene, registry, ao);
  const vegetation = buildVegetation(scene, registry, ao);
  // 전장의 흔적 — AO(그을림)를 쓰므로 ao.build() 전에 와야 한다
  buildScars(scene, registry, ao, props.obstacles);
  ao.build(scene, registry);

  const targets = buildTargets(scene, registry);

  return {
    scene,
    registry,
    terrain,
    vegetation,
    props,
    sun,
    targets,
    sky,
    hemi,
    fog,
    obstacles: props.obstacles,
    heightAt: terrainH,
  };
}

/**
 * 지평선 스커트 — 지형(±800m) 밖을 단색 지면으로 지평선까지 잇는다.
 *
 * 점검 스윕에서 맵 가장자리 근처를 날면 **지형이 끊긴 자리가 그대로 보였다**
 * (sweep-10). 안개(far 540m)는 점진 감쇠라 300m 대부터 끝 라인이 비친다.
 * 디테일 없는 큰 원판 하나(+1콜)면 지면이 안개 속으로 무한히 이어진다.
 * 살짝 낮게(-1.2m) 깔아 실제 지형과 z-파이팅하지 않는다.
 */
function addHorizonSkirt(scene: THREE.Scene, registry: ThermalRegistry): void {
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(3000, 24),
    // 지면 팔레트의 중간값 — 안개에 녹아들며 실제 지형과 이어져 보인다
    new THREE.MeshLambertMaterial({ color: 0x8d8668 }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -1.2;
  scene.add(skirt);
  registry.register(skirt, 0.6);
}

/**
 * 조명 — 색·강도·위치 전부 프로토타입 실측값.
 *
 * ⚠️ `LIGHT_SCALE`: three r155 부터 조명이 물리 단위로 바뀌어(useLegacyLights 제거)
 * 같은 intensity 가 r128 대비 약 π배 어둡다. 프로토타입 룩이 검증 기준이므로 보정한다.
 * 정식 물리 조명으로 갈 거라면 후처리 파라미터를 함께 다시 잡아야 한다.
 */
const LIGHT_SCALE = Math.PI;

function addAmbient(scene: THREE.Scene): THREE.HemisphereLight {
  const hemi = new THREE.HemisphereLight(DAYLIGHT.hemiSky, DAYLIGHT.hemiGround, 1.05 * LIGHT_SCALE);
  scene.add(hemi);
  return hemi;
}

function addSun(scene: THREE.Scene): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(DAYLIGHT.sunColor, 1.25 * LIGHT_SCALE);
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
