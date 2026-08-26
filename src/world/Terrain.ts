import * as THREE from 'three';
import { fbm } from './noise';
import { dirtTex, groundTex, roadTex, texMat } from './textures';
import type { ThermalRegistry } from './ThermalRegistry';

/**
 * 지형·수면·도로. 전부 지형 높이를 따라간다.
 * `terrainH` 는 비행 물리(고도 추종)와 소품 배치가 함께 쓰는 단일 출처다 —
 * 여기 계수를 바꾸면 지형과 비행이 동시에 달라진다.
 */

export const TER = 1600;
export const SEG = 110;

/** 월드 좌표의 지면 높이(m). */
export function terrainH(x: number, z: number): number {
  return (
    fbm(x * 0.0035 + 100, z * 0.0035 + 100, 4) * 16 - 8 + fbm(x * 0.017 + 50, z * 0.017 + 50, 3) * 2.2
  );
}

export interface TerrainHandles {
  ground: THREE.Mesh;
  water: THREE.Mesh;
  road: THREE.Mesh;
  dirtPaths: THREE.Mesh[];
}

export function buildTerrain(scene: THREE.Scene, registry: ThermalRegistry): TerrainHandles {
  const texGround = groundTex(512);
  texGround.repeat.set(60, 60);

  const geo = new THREE.PlaneGeometry(TER, TER, SEG, SEG);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, terrainH(pos.getX(i), -pos.getY(i)));
  }
  geo.computeVertexNormals();

  // 대스케일 정점 컬러 — 텍스처 반복 패턴을 덮는다.
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i);
    const h = pos.getZ(i);
    const patch = fbm(x * 0.01 + 100, z * 0.01 + 100, 3);
    const field = fbm(x * 0.0026 + 7, z * 0.0026 + 7, 2); // 밭 구획 단위
    const t = Math.max(0, Math.min(1, (patch - 0.38) * 3.2));
    let r = 1.18 - t * 0.42;
    let g = 1.1 - t * 0.2;
    let b = 0.86 - t * 0.3;
    const fv = 0.82 + field * 0.46; // 구획별 밝기 차
    r *= fv;
    g *= fv;
    b *= fv;
    const low = Math.max(0, -h) * 0.02; // 저지대는 습해서 진함
    colors[i * 3] = r - low;
    colors[i * 3 + 1] = g - low * 0.6;
    colors[i * 3 + 2] = b - low * 0.4;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const ground = registry.registerAs(
    new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texGround, vertexColors: true })),
    'ground',
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 물은 열화상에서 검게 나와 지형 판별의 핵심 단서가 된다 (06 문서 1.1).
  const water = registry.registerAs(
    new THREE.Mesh(new THREE.PlaneGeometry(700, 420), new THREE.MeshLambertMaterial({ color: 0x4a5651 })),
    'water',
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-330, -6.5, -260);
  scene.add(water);

  const road = buildRoad(scene, registry);
  const dirtPaths = [
    buildDirtPath(scene, registry, -40, -40, 0.36, 900, 7),
    buildDirtPath(scene, registry, -150, 180, -1.15, 620, 6),
  ];

  return { ground, water, road, dirtPaths };
}

function buildRoad(scene: THREE.Scene, registry: ThermalRegistry): THREE.Mesh {
  const texRoad = roadTex(256);
  texRoad.repeat.set(1, 70);

  const geo = new THREE.PlaneGeometry(14, 1500, 1, 90);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, terrainH(120, -pos.getY(i)) + 0.12);
  }
  geo.computeVertexNormals();

  const road = registry.registerAs(new THREE.Mesh(geo, texMat(texRoad)), 'road');
  road.rotation.x = -Math.PI / 2;
  road.position.set(120, 0, 0);
  road.receiveShadow = true;
  scene.add(road);
  return road;
}

/**
 * 흙길. 로컬 좌표를 월드로 돌릴 때 **z 부호가 음수**다 —
 * 프로토타입에서 이 부호를 틀려 길이 지형을 뚫고 나갔던 자리다(DEVLOG 2026-08-25).
 */
function buildDirtPath(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  cx: number,
  cz: number,
  rot: number,
  len: number,
  wid: number,
): THREE.Mesh {
  const texDirt = dirtTex(256);
  texDirt.repeat.set(2, 50);

  const geo = new THREE.PlaneGeometry(wid, len, 1, 60);
  const pos = geo.attributes.position;
  const s = Math.sin(rot);
  const co = Math.cos(rot);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const wx = cx + lx * co - ly * s;
    const wz = cz - lx * s - ly * co;
    pos.setZ(i, terrainH(wx, wz) + 0.1);
  }
  geo.computeVertexNormals();

  const mesh = registry.registerAs(new THREE.Mesh(geo, texMat(texDirt)), 'dirt');
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rot;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
