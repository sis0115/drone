import * as THREE from 'three';
import { rnd } from './noise';
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
    { geometry: CYL, matrix: place(1.25, 3.0, 1.5, 0, 0, 0, 0.13, 1.6, 0.13), color: [0.2, 0.19, 0.17] }, // 배기관
    { geometry: BOX, matrix: place(0, 0.95, 4.3, 0, 0, 0, 2.7, 0.5, 0.25), color: [0.24, 0.23, 0.2] }, // 범퍼
  ];
}

/** ② 적재함 — 중온 */
function bodyParts(): MergePart[] {
  return [
    { geometry: BOX, matrix: place(0, 2.3, -1.6, 0, 0, 0, 2.9, 2.3, 7.2), color: [0.36, 0.35, 0.27] }, // 캔버스 덮개
    { geometry: BOX, matrix: place(0, 1.05, -1.6, 0, 0, 0, 3.0, 0.5, 7.4), color: [0.28, 0.27, 0.22] }, // 적재 바닥
    { geometry: BOX, matrix: place(0, 3.42, -1.6, 0, 0, 0, 2.5, 0.14, 7.0), color: [0.3, 0.29, 0.24] }, // 지붕 리브
    { geometry: BOX, matrix: place(0, 2.3, -5.15, 0, 0, 0, 2.85, 2.2, 0.14), color: [0.32, 0.31, 0.25] }, // 후면
  ];
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
