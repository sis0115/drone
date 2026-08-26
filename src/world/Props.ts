import * as THREE from 'three';
import { fbm, rnd } from './noise';
import { roofTex, texMat, wallTex } from './textures';
import { terrainH } from './Terrain';
import { buildInstanced, type InstanceSpec } from './Instancing';
import type { ThermalRegistry } from './ThermalRegistry';
import type { AoCollector } from './Ao';
import { HEAT } from '@/data/thermal';

/**
 * 소품 — 건물·연료탱크·송전탑·가드레일·전신주·건초·바위·통나무.
 * 건물만 개별 Mesh 다(각자 다른 벽 텍스처 + LOS 차폐 판정 대상).
 * **나머지는 전부 인스턴싱.** 개별로 만들면 여기서만 드로우콜이 수백 단위로 뛴다.
 */

/** LOS 차폐·충돌 판정 대상. `mesh` 는 인스턴스라 없을 수 있어 위치를 따로 둔다. */
export interface Obstacle {
  position: THREE.Vector3;
  /** 수평 반경 (충돌 근사) */
  radius: number;
  height: number;
  box: THREE.Box3;
  mesh?: THREE.Mesh;
}

export interface PropHandles {
  obstacles: Obstacle[];
  /** 착륙 패드 (스폰 지점 표시) */
  pad: THREE.Mesh;
}

export function buildProps(scene: THREE.Scene, registry: ThermalRegistry, ao: AoCollector): PropHandles {
  const obstacles: Obstacle[] = [];
  const opts = { registry, scene };
  const white = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

  buildRocks(scene, registry);
  buildLogs(scene, registry);
  buildHouses(scene, registry, ao, obstacles);
  buildFuelTanks(scene, registry, obstacles);
  buildPylons(scene, registry, obstacles);

  // 가드레일 — 도로 양옆. 06 문서 E5 가 "도로 인식의 핵심"으로 지목한 요소.
  const rails: InstanceSpec[] = [];
  for (let z = -680; z < 680; z += 8)
    for (const o of [-8.4, 8.4])
      rails.push({ p: [120 + o, terrainH(120 + o, z) + 0.8, z], r: [0, 0, 0], s: [1, 1, 1], c: 0xcfd2c6 });
  buildInstanced(new THREE.BoxGeometry(0.35, 0.8, 7.2), white(), rails, { heat: HEAT.rail, ...opts });

  buildPowerLine(scene, registry);
  buildHaystacks(scene, registry);

  const pad = registry.registerAs(
    new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshLambertMaterial({ color: 0x8a8f6b })),
    'pad',
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, terrainH(0, 0) + 0.09, 0);
  scene.add(pad);

  return { obstacles, pad };
}

/** 바위 4종 변형. 지오메트리가 달라 4콜이지만 개체는 90개다. */
function buildRocks(scene: THREE.Scene, registry: ThermalRegistry): void {
  const COLORS = [0x7b7a70, 0x6b6a60, 0x87857a];
  const buckets: InstanceSpec[][] = [[], [], [], []];
  for (let i = 0; i < 90; i++) {
    const x = rnd(-440, 440);
    const z = rnd(-440, 440);
    const sc = rnd(0.5, 1.9);
    buckets[i & 3].push({
      p: [x, terrainH(x, z) + 0.3, z],
      r: [rnd(0, 3), rnd(0, 3), rnd(0, 3)],
      s: [sc, sc * rnd(0.6, 1), sc],
      c: COLORS[(Math.random() * 3) | 0],
    });
  }
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true });
  for (let b = 0; b < 4; b++) {
    buildInstanced(rockGeo(1.0 + b * 0.35), mat, buckets[b], { heat: HEAT.rock, registry, scene });
  }
}

function rockGeo(r: number): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 1);
  const pp = g.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    const z = pp.getZ(i);
    const k = 0.62 + fbm(x * 1.6 + 9, z * 1.6 + 9, 3) * 0.85;
    pp.setXYZ(i, x * k, y * k * rnd(0.75, 1.0), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 통나무.
 * ⚠️ 프로토타입은 이걸 **두 번** 만든다 — 개별 Mesh 45개 루프(드로우콜 45개)와
 * 인스턴스 50개. 시각적으로 중복이고 앞쪽 45콜은 순수 낭비다.
 * 이식하면서 인스턴스 쪽만 남겼다 (02 문서 인스턴싱 규칙).
 */
function buildLogs(scene: THREE.Scene, registry: ThermalRegistry): void {
  const list: InstanceSpec[] = [];
  for (let i = 0; i < 50; i++) {
    const x = rnd(-420, 420);
    const z = rnd(-420, 420);
    list.push({
      p: [x, terrainH(x, z) + 0.55, z],
      r: [0, rnd(0, 3.14), Math.PI / 2],
      s: [1, rnd(0.7, 1.6), 1],
      c: 0x5b4a33,
    });
  }
  buildInstanced(
    new THREE.CylinderGeometry(0.55, 0.68, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    list,
    { heat: HEAT.log, registry, scene },
  );
}

function buildHouses(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  ao: AoCollector,
  obstacles: Obstacle[],
): void {
  // 벽 텍스처를 3종만 만들어 돌려 쓴다 — 집마다 새로 구우면 텍스처 메모리가 터진다.
  const WALL_SM = [0, 1, 2].map(() => new THREE.MeshLambertMaterial({ map: wallTex(1, 3) }));
  const WALL_BIG = [0, 1].map(() => new THREE.MeshLambertMaterial({ map: wallTex(1, 5) }));
  const ROOF = [texMat(roofTex(false)), texMat(roofTex(true))];

  const chimneys: InstanceSpec[] = [];
  const rubble: InstanceSpec[] = [];

  /** kind: 0 농가 / 1 창고 / 2 폐가 */
  const makeHouse = (px: number, pz: number, kind: 0 | 1 | 2): void => {
    const y = terrainH(px, pz);
    const w = kind === 1 ? rnd(16, 26) : rnd(7, 12);
    const d = kind === 1 ? rnd(20, 34) : rnd(8, 14);
    const h = kind === 1 ? rnd(6, 9) : rnd(3.2, 4.6);

    const walls = registry.registerAs(
      new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        kind === 1 ? WALL_BIG[(Math.random() * 2) | 0] : WALL_SM[(Math.random() * 3) | 0],
      ),
      'wall',
    );
    walls.position.set(px, y + h / 2, pz);
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);
    ao.add(px, pz, Math.max(w, d) * 0.85);

    if (kind !== 2) {
      // 박공지붕 = 삼각기둥(원기둥 3분할)을 눕힌 것
      const rw = Math.hypot(w / 2, w * 0.34);
      const roof = registry.register(
        new THREE.Mesh(new THREE.CylinderGeometry(rw, rw, d * 1.06, 3), ROOF[kind === 1 ? 1 : 0]),
        kind === 1 ? HEAT.roofMetal : HEAT.roof,
      );
      roof.rotation.x = -Math.PI / 2;
      roof.scale.set(1, 1, 0.66);
      roof.position.set(px, y + h + w * 0.16, pz);
      roof.castShadow = true;
      scene.add(roof);
      if (kind === 0 && Math.random() < 0.7) {
        chimneys.push({
          p: [px + rnd(-w * 0.25, w * 0.25), y + h + 1.6, pz + rnd(-d * 0.2, d * 0.2)],
          r: [0, 0, 0],
          s: [1, 1, 1],
          c: 0x8a7a68,
        });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        rubble.push({
          p: [px + rnd(-w, w), y + rnd(0.2, 0.8), pz + rnd(-d, d)],
          r: [rnd(0, 1), rnd(0, 3), rnd(0, 1)],
          s: [rnd(1, 3), rnd(0.4, 1), rnd(1, 3)],
          c: 0x9c9484,
        });
      }
    }

    obstacles.push({
      position: walls.position.clone(),
      radius: Math.max(w, d) * 0.55,
      height: h,
      box: new THREE.Box3().setFromObject(walls),
      mesh: walls,
    });
  };

  for (let i = 0; i < 11; i++) makeHouse(rnd(-340, 60), rnd(-340, 340), 0);
  for (let i = 0; i < 4; i++) makeHouse(rnd(-330, 40), rnd(-330, 330), 1);
  for (let i = 0; i < 4; i++) makeHouse(rnd(-330, 40), rnd(-330, 330), 2);

  const opts = { registry, scene };
  buildInstanced(new THREE.BoxGeometry(0.8, 2.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xffffff }), chimneys, {
    heat: HEAT.chimney,
    ...opts,
  });
  buildInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), rubble, {
    heat: HEAT.rubble,
    ...opts,
  });
}

function buildFuelTanks(scene: THREE.Scene, registry: ThermalRegistry, obstacles: Obstacle[]): void {
  const list: InstanceSpec[] = [];
  for (let i = 0; i < 5; i++) {
    const r0 = rnd(6, 9);
    const tx = -200 + i * 26;
    const tz = 300 + rnd(-18, 18);
    const ty = terrainH(tx, tz) + 4.5;
    list.push({ p: [tx, ty, tz], r: [0, 0, 0], s: [r0, 1, r0], c: 0x9aa093 });
    obstacles.push({
      position: new THREE.Vector3(tx, ty, tz),
      radius: r0 + 0.6,
      height: 9,
      box: new THREE.Box3(
        new THREE.Vector3(tx - r0, ty - 4.5, tz - r0),
        new THREE.Vector3(tx + r0, ty + 4.5, tz + r0),
      ),
    });
  }
  buildInstanced(
    new THREE.CylinderGeometry(1, 1, 9, 14),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    list,
    { heat: HEAT.silo, registry, scene },
  );
}

function buildPylons(scene: THREE.Scene, registry: ThermalRegistry, obstacles: Obstacle[]): void {
  const list: InstanceSpec[] = [];
  for (let i = 0; i < 5; i++) {
    const px = rnd(-240, 240);
    const pz = rnd(-240, 240);
    const ty = terrainH(px, pz) + 18;
    list.push({ p: [px, ty, pz], r: [0, 0, 0], s: [1, 1, 1], c: 0x6d6d63 });
    obstacles.push({
      position: new THREE.Vector3(px, ty, pz),
      radius: 2.4,
      height: 36,
      box: new THREE.Box3(new THREE.Vector3(px - 1, ty - 18, pz - 1), new THREE.Vector3(px + 1, ty + 18, pz + 1)),
    });
  }
  buildInstanced(new THREE.BoxGeometry(2, 36, 2), new THREE.MeshLambertMaterial({ color: 0xffffff }), list, {
    heat: HEAT.pylon,
    registry,
    scene,
  });
}

/** 전신주 + 팔 + 현수선. 전선은 전부 하나의 LineSegments 로 병합해 1콜. */
function buildPowerLine(scene: THREE.Scene, registry: ThermalRegistry): void {
  const poles: InstanceSpec[] = [];
  const arms: InstanceSpec[] = [];
  const pts: THREE.Vector3[] = [];
  let prev: THREE.Vector3 | null = null;

  for (let z = -660; z <= 660; z += 44) {
    const px = 137;
    const y = terrainH(px, z);
    poles.push({ p: [px, y + 4.5, z], r: [0, 0, 0], s: [1, 1, 1], c: 0x6b5a45 });
    arms.push({ p: [px, y + 8.2, z], r: [0, 0, 0], s: [1, 1, 1], c: 0x6b5a45 });
    const top = new THREE.Vector3(px, y + 8.2, z);
    if (prev) {
      // 현수선은 2차 베지어로 늘어뜨린다.
      const mid = prev.clone().add(top).multiplyScalar(0.5);
      mid.y -= 1.1;
      const curve = new THREE.QuadraticBezierCurve3(prev, mid, top).getPoints(6);
      for (let i = 0; i < curve.length - 1; i++) pts.push(curve[i], curve[i + 1]);
    }
    prev = top;
  }

  const opts = { registry, scene };
  buildInstanced(
    new THREE.CylinderGeometry(0.18, 0.26, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    poles,
    { heat: HEAT.pole, ...opts },
  );
  buildInstanced(
    new THREE.BoxGeometry(2.4, 0.16, 0.16),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    arms,
    { heat: HEAT.pole, shadow: false, ...opts },
  );

  // C1 위협(전선줄)의 시각적 실체. 저화질 화면에서 거의 안 보이는 것이 의도다.
  scene.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x2a2a26 }),
    ),
  );
}

function buildHaystacks(scene: THREE.Scene, registry: ThermalRegistry): void {
  const list: InstanceSpec[] = [];
  for (let i = 0; i < 28; i++) {
    const x = rnd(-400, 400);
    const z = rnd(-400, 400);
    if (Math.abs(x - 120) < 20) continue;
    const r0 = rnd(1.1, 1.8);
    list.push({
      p: [x, terrainH(x, z) + r0, z],
      r: [0, rnd(0, 3), Math.PI / 2],
      s: [r0, r0, r0],
      c: 0xc9b072,
    });
  }
  buildInstanced(
    new THREE.CylinderGeometry(1, 1, 1.7, 10),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    list,
    { heat: HEAT.hay, registry, scene },
  );
}
