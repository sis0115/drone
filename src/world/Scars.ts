import * as THREE from 'three';
import { random, rnd } from './noise';
import { terrainH } from './Terrain';
import { mergeParts, place } from './mergeGeometries';
import { smokeTex } from './textures';
import type { ThermalRegistry } from './ThermalRegistry';
import type { AoCollector } from './Ao';
import type { Obstacle } from './Props';
import { HEAT } from '@/data/thermal';

/**
 * 전장의 흔적 — 아트 패스 1 (DEVLOG 2026-08-26).
 *
 * "3D 모델링 느낌"의 진짜 원인은 렌더 품질이 아니라 **씬이 멀쩡하다는 것**이었다.
 * 포탄공도, 불탄 차량도, 연기도 없는 들판은 조명이 어떻든 평화로운 시뮬레이터다.
 * 현장감은 사건의 흔적에서 온다 — 480×270 에서는 모델 디테일이 다 뭉개지므로
 * 디테일이 아니라 **실루엣과 배치**로 만든다. 전부 프로시저럴(규칙 3 유지), 총 +3 드로우콜.
 *
 * 배치는 무작위 살포가 아니라 **도로를 따라간다** — 포격은 보급로에 떨어진다.
 * 이 규칙 자체가 내러티브다: 플레이어가 다니는 길이 곧 위험한 길이다.
 */

const ROAD_X = 120;

export function buildScars(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  ao: AoCollector,
  obstacles: Obstacle[],
): void {
  buildCraters(scene, registry, ao);
  buildWrecks(scene, registry, ao, obstacles);
  buildSmokeColumns(scene, registry);
}

/**
 * 포탄공 — 어두운 구덩이 원판 + 흙이 뒤집힌 림. 지형은 파지 않는다(heightAt 불변) —
 * 저화질에서 구덩이의 실체는 "어두운 원 + 밝은 테두리"라는 명암 패턴이다.
 */
function buildCraters(scene: THREE.Scene, registry: ThermalRegistry, ao: AoCollector): void {
  const disc = new THREE.CircleGeometry(1, 12);
  const rim = new THREE.TorusGeometry(1.02, 0.22, 5, 12);

  const parts = [
    // 구덩이 바닥 — 그을린 흙
    { geometry: disc, matrix: place(0, 0, 0, -Math.PI / 2, 0, 0, 1, 1, 1), color: [0.16, 0.14, 0.12] as [number, number, number] },
    // 뒤집힌 흙 테두리 — 주변 지면보다 밝고 생흙색
    { geometry: rim, matrix: place(0, 0.1, 0, -Math.PI / 2, 0, 0, 1, 1, 0.5), color: [0.44, 0.38, 0.29] as [number, number, number] },
  ];
  const geometry = mergeParts(parts);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    // 도로(지형+0.12)·지면과 거의 공면이다 — 깊이 싸움에서 항상 이겨야 한다
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const spots: { x: number; z: number; r: number }[] = [];
  // 도로 주변 포격대 — 보급로를 노린 탄착군. 군집이 무작위 살포보다 "포격"으로 읽힌다.
  // 반경 2.5~5m: 480p 에서 이보다 작으면 수십 미터만 떨어져도 픽셀 두 개로 뭉개진다(1차 실측).
  for (let cluster = 0; cluster < 5; cluster++) {
    const cz = -420 + cluster * 170 + rnd(-40, 40);
    const cx = ROAD_X + rnd(-24, 24);
    const n = 3 + ((random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      spots.push({ x: cx + rnd(-20, 20), z: cz + rnd(-20, 20), r: rnd(2.5, 5.0) });
    }
  }
  // 아스팔트 위 직격탄 — 밝은 노면 위의 검은 원이 가장 잘 읽힌다. 도로가 곧 전장이라는 표지.
  for (const z of [-96, -262, -388, 150]) {
    spots.push({ x: ROAD_X + rnd(-3.5, 3.5), z: z + rnd(-12, 12), r: rnd(2.2, 3.6) });
  }
  // 들판 유탄 — 드문드문
  for (let i = 0; i < 8; i++) {
    spots.push({ x: rnd(-380, 60), z: rnd(-380, 380), r: rnd(2.0, 3.4) });
  }

  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const yawQ = new THREE.Quaternion();
  spots.forEach((s, i) => {
    /**
     * 평평한 원판을 수평으로 놓으면 경사에서 지형에 파묻힌다 — 1차 배치가 그래서
     * 하나도 안 보였다. 지형 기울기(유한 차분)에 원판을 맞춘다.
     */
    const e = 1.5;
    const dx = (terrainH(s.x + e, s.z) - terrainH(s.x - e, s.z)) / (2 * e);
    const dz = (terrainH(s.x, s.z + e) - terrainH(s.x, s.z - e)) / (2 * e);
    normal.set(-dx, 1, -dz).normalize();
    dummy.position.set(s.x, terrainH(s.x, s.z) + 0.22, s.z);
    dummy.quaternion.setFromUnitVectors(up, normal);
    yawQ.setFromAxisAngle(normal, rnd(0, 6.28));
    dummy.quaternion.premultiply(yawQ);
    dummy.scale.setScalar(s.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // 그을림 — AO 패치 시스템에 얹는다(추가 드로우콜 0). 구덩이보다 넓게 번진다.
    ao.add(s.x, s.z, s.r * 2.6);
  });
  mesh.receiveShadow = true;
  scene.add(mesh);
  // 뒤집힌 흙은 지면과 같은 온도 — 열화상에서 튀면 안 된다
  registry.register(mesh, HEAT.ground * 0.85);
}

/**
 * 불탄 차량 잔해 — 도로변에 밀려나 있는 껍데기.
 *
 * 표적 트럭과 **같은 실루엣 문법**(후드/캡/적재함)을 쓰되 전소 색이다.
 * 열화상에서 잔해는 **차갑고**(0.28) 살아 있는 표적 엔진은 백열(0.98) —
 * 이 대비가 "형상만 보고 쏘면 안 된다"는 D1 디코이 학습의 기반이 된다.
 */
function buildWrecks(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  ao: AoCollector,
  obstacles: Obstacle[],
): void {
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
  const char: [number, number, number] = [0.09, 0.085, 0.08]; // 탄 껍데기
  const rust: [number, number, number] = [0.23, 0.15, 0.1]; // 녹슨 철
  const burnt: [number, number, number] = [0.14, 0.12, 0.1];

  const geometry = mergeParts([
    // 캡 — 찌그러져 내려앉음
    { geometry: BOX, matrix: place(0, 1.7, 2.1, 0.08, 0, 0.05, 2.7, 1.2, 1.7), color: char },
    { geometry: BOX, matrix: place(0, 1.0, 3.3, 0, 0, 0, 2.5, 0.9, 1.9), color: burnt },
    // 적재함 — 골조만 남음
    { geometry: BOX, matrix: place(0, 1.6, -1.5, 0, 0, 0, 2.8, 1.4, 6.8), color: rust },
    { geometry: BOX, matrix: place(0, 2.4, -1.5, -0.06, 0, 0, 2.6, 0.16, 6.4), color: char },
    // 주저앉은 바퀴 자리
    { geometry: CYL, matrix: place(1.4, 0.5, 2.6, 0, 0, Math.PI / 2, 0.55, 0.4, 0.55), color: char },
    { geometry: CYL, matrix: place(-1.4, 0.5, -2.6, 0, 0, Math.PI / 2, 0.55, 0.4, 0.55), color: char },
  ]);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  // 도로변 — 밀어낸 잔해는 길 위가 아니라 길가에 쌓인다
  const spots: { x: number; z: number; ry: number }[] = [
    { x: ROAD_X - 7.5, z: -60, ry: 0.35 },
    { x: ROAD_X + 8.2, z: -175, ry: -2.6 },
    { x: ROAD_X - 8.8, z: -305, ry: 1.9 },
    { x: ROAD_X + 7.0, z: 96, ry: 2.9 },
    { x: 36, z: -122, ry: -0.7 }, // 들판으로 도망치다 잡힌 한 대
  ];

  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((s, i) => {
    const y = terrainH(s.x, s.z);
    dummy.position.set(s.x, y, s.z);
    // 한쪽으로 주저앉은 기울기 — 반듯한 잔해는 없다
    dummy.rotation.set(rnd(-0.06, 0.06), s.ry, rnd(0.04, 0.12) * (random() < 0.5 ? -1 : 1));
    dummy.scale.setScalar(rnd(0.92, 1.05));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    ao.add(s.x, s.z, 5.2);

    obstacles.push({
      position: new THREE.Vector3(s.x, y + 1.2, s.z),
      radius: 3.4,
      height: 2.6,
      box: new THREE.Box3(
        new THREE.Vector3(s.x - 3.2, y - 0.5, s.z - 3.2),
        new THREE.Vector3(s.x + 3.2, y + 2.6, s.z + 3.2),
      ),
    });
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // 전소 잔해는 차갑다 — 살아 있는 엔진(0.98)과의 대비가 목적
  registry.register(mesh, 0.28);
}

/**
 * 지평선의 연기 기둥 — "여기 말고도 전선이 있다".
 *
 * 빌보드가 아니라 **테이퍼 실린더**다. world/ 는 카메라를 모르므로(계층 규칙)
 * 시점 독립 지오메트리를 쓴다. 원경 + 안개 + 그레인이 정적임을 가려 준다.
 */
function buildSmokeColumns(scene: THREE.Scene, registry: ThermalRegistry): void {
  const geometry = new THREE.CylinderGeometry(9, 2.2, 120, 7, 4, true);
  const material = new THREE.MeshLambertMaterial({
    map: smokeTex(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0x35342f,
    opacity: 0.78,
  });

  // 중원경 — 1차 배치(±430~480m)는 안개(far 540m)에 **전부** 먹혀 보이지 않았다.
  // 안개에 절반만 먹히려면 300m 대에 서야 한다. 실측으로 잡은 자리다.
  const spots: [number, number][] = [
    [340, -330],
    [-310, -260],
    [60, 390],
  ];
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, terrainH(x, z) + 58, z);
    dummy.rotation.set(0, rnd(0, 6.28), rnd(0.03, 0.09)); // 바람에 살짝 기운다
    dummy.scale.set(rnd(0.8, 1.3), rnd(0.9, 1.25), rnd(0.8, 1.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(mesh);
  // 연기는 열화상에서 미지근한 회색 기둥
  registry.pairs.push({
    mesh,
    normal: material,
    thermal: new THREE.MeshBasicMaterial({
      map: material.map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: new THREE.Color(0.55, 0.55, 0.55),
      opacity: 0.78,
      fog: true,
    }),
  });
}
