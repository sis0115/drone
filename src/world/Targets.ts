import * as THREE from 'three';
import { rnd } from './noise';
import { smokeTex } from './textures';
import { terrainH } from './Terrain';
import { mergeParts, place, type MergePart } from './mergeGeometries';
import type { ThermalRegistry } from './ThermalRegistry';
import { HEAT } from '@/data/thermal';

/**
 * 표적 — 보급 트럭 (GDD M2 강철 사냥 / M9 병참 봉쇄의 기본 표적).
 *
 * 파트를 **열화상 값 기준으로 3덩이**로 나눈다: 엔진부(0.98 백열) / 적재함(0.60) / 바퀴(0.45).
 * 열화상에서 트럭이 통째로 하얗게 뜨면 안 되고 엔진이 튀어야 하기 때문이다 (06 문서 1.1).
 * 각 덩이는 지오메트리 병합 + 정점 컬러라 **1콜씩, 트럭 1대 = 3콜**.
 */
export interface Target {
  group: THREE.Group;
  alive: boolean;
  /** 도로를 따라 이동하는 속도 (m/s) */
  speed: number;
  kind: 'truck';
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);

/** ① 엔진부 — 열화상에서 백열로 튄다 */
function hotParts(): MergePart[] {
  return [
    { geometry: BOX, matrix: place(0, 1.15, 3.35, 0, 0, 0, 2.6, 1.1, 2.0), color: [0.42, 0.4, 0.31] }, // 후드
    { geometry: BOX, matrix: place(0, 2.15, 2.05, 0, 0, 0, 2.8, 1.6, 1.7), color: [0.46, 0.44, 0.34] }, // 캡
    { geometry: BOX, matrix: place(0, 2.35, 2.9, 0, 0, 0, 2.45, 1.0, 0.14), color: [0.12, 0.16, 0.18] }, // 앞유리
    // 캡 옆유리 — 옆에서 봤을 때 "차량"으로 읽히는 결정타
    { geometry: BOX, matrix: place(1.41, 2.4, 2.05, 0, 0, 0, 0.06, 0.85, 1.2), color: [0.13, 0.17, 0.19] },
    { geometry: BOX, matrix: place(-1.41, 2.4, 2.05, 0, 0, 0, 0.06, 0.85, 1.2), color: [0.13, 0.17, 0.19] },
    { geometry: CYL, matrix: place(1.25, 3.0, 1.5, 0, 0, 0, 0.13, 1.6, 0.13), color: [0.2, 0.19, 0.17] }, // 배기관
    { geometry: BOX, matrix: place(0, 0.95, 4.3, 0, 0, 0, 2.7, 0.5, 0.25), color: [0.24, 0.23, 0.2] }, // 범퍼
    // 라디에이터 그릴 — 후드 앞면의 어두운 격자
    { geometry: BOX, matrix: place(0, 1.35, 4.36, 0, 0, 0, 1.9, 0.62, 0.1), color: [0.12, 0.12, 0.11] },
    // 전조등 2점 — 밝은 점 2개가 "차 얼굴"을 만든다
    { geometry: BOX, matrix: place(0.95, 1.42, 4.4, 0, 0, 0, 0.34, 0.3, 0.08), color: [0.75, 0.74, 0.62] },
    { geometry: BOX, matrix: place(-0.95, 1.42, 4.4, 0, 0, 0, 0.34, 0.3, 0.08), color: [0.75, 0.74, 0.62] },
    // 펜더 — 앞바퀴 위 반원 덮개 격
    { geometry: BOX, matrix: place(1.5, 1.5, 3.1, 0, 0, 0, 0.32, 0.24, 1.6), color: [0.34, 0.33, 0.26] },
    { geometry: BOX, matrix: place(-1.5, 1.5, 3.1, 0, 0, 0, 0.32, 0.24, 1.6), color: [0.34, 0.33, 0.26] },
    // 사이드미러
    { geometry: BOX, matrix: place(1.55, 2.6, 2.95, 0, 0, 0, 0.08, 0.3, 0.2), color: [0.16, 0.16, 0.15] },
    { geometry: BOX, matrix: place(-1.55, 2.6, 2.95, 0, 0, 0, 0.08, 0.3, 0.2), color: [0.16, 0.16, 0.15] },
    // 연료탱크 — 사이드 실린더. 군용 트럭의 실루엣 특징
    { geometry: CYL, matrix: place(1.35, 0.85, 0.6, 0, 0, Math.PI / 2, 0.34, 1.1, 0.34), color: [0.3, 0.29, 0.24] },
  ];
}

/** ② 적재함 — 중온 */
function bodyParts(): MergePart[] {
  const parts: MergePart[] = [
    { geometry: BOX, matrix: place(0, 2.3, -1.6, 0, 0, 0, 2.9, 2.3, 7.2), color: [0.36, 0.35, 0.27] }, // 캔버스 덮개
    { geometry: BOX, matrix: place(0, 1.05, -1.6, 0, 0, 0, 3.0, 0.5, 7.4), color: [0.28, 0.27, 0.22] }, // 적재 바닥
    { geometry: BOX, matrix: place(0, 3.42, -1.6, 0, 0, 0, 2.5, 0.14, 7.0), color: [0.3, 0.29, 0.24] }, // 지붕 리브
    { geometry: BOX, matrix: place(0, 2.3, -5.15, 0, 0, 0, 2.85, 2.2, 0.14), color: [0.32, 0.31, 0.25] }, // 후면
  ];
  // 캔버스 골조 리브 — 위장 덮개를 "천막"으로 읽게 하는 세로 골 4줄
  for (const rz of [-4.2, -2.6, -1.0, 0.6]) {
    parts.push({
      geometry: BOX,
      matrix: place(0, 2.35, rz, 0, 0, 0, 2.98, 2.2, 0.1),
      color: [0.31, 0.3, 0.23],
    });
  }
  // 적재함 하부 새시 — 바닥 밑 어두운 프레임. 차체가 "떠 있지 않게" 한다
  parts.push({
    geometry: BOX,
    matrix: place(0, 0.7, -1.6, 0, 0, 0, 2.2, 0.28, 6.8),
    color: [0.12, 0.12, 0.11],
  });
  // 뒷 머드플랩
  parts.push({ geometry: BOX, matrix: place(1.3, 0.45, -4.9, 0, 0, 0, 0.5, 0.5, 0.06), color: [0.1, 0.1, 0.1] });
  parts.push({ geometry: BOX, matrix: place(-1.3, 0.45, -4.9, 0, 0, 0, 0.5, 0.5, 0.06), color: [0.1, 0.1, 0.1] });
  return parts;
}

/** ③ 바퀴 — 저온 */
function wheelParts(): MergePart[] {
  const parts: MergePart[] = [];
  const positions: [number, number][] = [
    [1.42, 3.1], [-1.42, 3.1], [1.42, -1.0], [-1.42, -1.0], [1.42, -3.2], [-1.42, -3.2],
  ];
  for (const [wx, wz] of positions) {
    parts.push({
      geometry: CYL,
      matrix: place(wx, 0.72, wz, 0, 0, Math.PI / 2, 0.72, 0.42, 0.72),
      color: [0.1, 0.1, 0.1],
    });
    parts.push({
      geometry: CYL,
      matrix: place(wx * 1.06, 0.72, wz, 0, 0, Math.PI / 2, 0.34, 0.1, 0.34),
      color: [0.3, 0.3, 0.28],
    });
  }
  return parts;
}

/** 도로(x=120)를 따라 남→북으로 달리는 종대. */
export function buildTargets(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  count = 3,
): Target[] {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geometries: [THREE.BufferGeometry, number][] = [
    [mergeParts(hotParts()), HEAT.truckEngine],
    [mergeParts(bodyParts()), HEAT.truckBed],
    [mergeParts(wheelParts()), HEAT.truckWheel],
  ];

  const targets: Target[] = [];
  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    for (const [geometry, heat] of geometries) {
      const mesh = registry.register(new THREE.Mesh(geometry, material), heat);
      mesh.castShadow = true;
      group.add(mesh);
    }
    group.position.set(ROAD_X, 0, -220 - i * 80);
    scene.add(group);
    targets.push({ group, alive: true, speed: rnd(7, 10), kind: 'truck' });
  }
  return targets;
}

/**
 * 격파 처리 — 프로토타입은 `visible=false` 로 트럭을 지웠지만, 아트 패스 이후
 * 격파된 표적은 **전소 잔해로 남는 것**이 현장감이고 확인(BDA, T8c)의 재료다.
 *
 * 열화상 처리가 핵심이다: 격파된 트럭의 엔진이 계속 백열(0.98)이면
 * "죽은 것은 차갑다"는 D1 디코이 학습 규칙과 모순된다. 세 파트의 열화상
 * 머티리얼을 전부 식은 것(0.28)으로 갈아 끼운다.
 */
export function destroyTarget(
  target: Target,
  registry: ThermalRegistry,
  thermalNow: boolean,
): void {
  if (!target.alive) return;
  target.alive = false;

  const burntNormal = new THREE.MeshLambertMaterial({ color: 0x211d19 });
  const burntThermal = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.28, 0.28, 0.28),
    fog: true,
  });
  for (const child of target.group.children) {
    if (!(child as THREE.Mesh).isMesh) continue;
    const mesh = child as THREE.Mesh;
    const pair = registry.pairs.find((q) => q.mesh === mesh);
    if (pair) {
      pair.normal = burntNormal;
      pair.thermal = burntThermal;
    }
    mesh.material = thermalNow ? burntThermal : burntNormal;
  }

  // 주저앉은 잔해 — 반듯하게 죽는 차는 없다
  target.group.rotation.z = 0.14;
  target.group.position.y -= 0.25;

  // 전소 연기 — 얇고 검은 기둥이 격파 지점을 표시한다 (확인 비행의 시각 단서)
  const smokeMat = new THREE.MeshLambertMaterial({
    map: smokeTex(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0x232220,
    opacity: 0.72,
  });
  const smoke: THREE.Mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 0.7, 34, 6, 3, true), smokeMat);
  smoke.position.set(0, 18, 0);
  target.group.add(smoke);
  registry.pairs.push({
    mesh: smoke,
    normal: smokeMat,
    thermal: new THREE.MeshBasicMaterial({
      map: smokeMat.map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // 갓 죽은 불씨 — 잔해(0.28)보다 따뜻하지만 살아 있는 엔진(0.98)에는 못 미친다
      color: new THREE.Color(0.5, 0.5, 0.5),
      opacity: 0.72,
      fog: true,
    }),
  });
  if (thermalNow) smoke.material = registry.pairs[registry.pairs.length - 1].thermal;
}

const ROAD_X = 120;
const LOOP_AT = 500;

/** 종대를 굴린다. 맵 끝에 닿으면 반대편으로 순환한다 — 표적이 마르지 않게. */
export function updateTargets(targets: readonly Target[], dt: number): void {
  for (const t of targets) {
    if (!t.alive) continue;
    t.group.position.z += t.speed * dt;
    if (t.group.position.z > LOOP_AT) t.group.position.z = -LOOP_AT;
    t.group.position.y = terrainH(ROAD_X, t.group.position.z) + 0.15;
  }
}
