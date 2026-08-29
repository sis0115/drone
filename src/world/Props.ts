import * as THREE from 'three';
import { fbm, random, rnd } from './noise';
import { concreteTex, roofTex, texMat, wallTex } from './textures';
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
      c: COLORS[(random() * 3) | 0],
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
  // 기단은 **인스턴싱**한다 — 집마다 개별 Mesh 로 두면 19 드로우콜이 그냥 날아간다(실측 84→103)
  const plinths: InstanceSpec[] = [];

  const fencePosts: InstanceSpec[] = [];
  const fenceRails: InstanceSpec[] = [];

  /**
   * 마당 울타리 — 항공 사진에서 농가를 "농가"로 읽게 하는 것은 집이 아니라 **경계**다.
   * 낡은 울타리라 군데군데 이가 빠져 있다(스킵 확률) — 완전한 사각형은 오히려 가짜 같다.
   */
  const makeYardFence = (px: number, pz: number, w: number, d: number): void => {
    const hw = w / 2 + rnd(3.5, 6);
    const hd = d / 2 + rnd(3.5, 6);
    const sides: [number, number, number, number][] = [
      [px - hw, pz - hd, px + hw, pz - hd],
      [px + hw, pz - hd, px + hw, pz + hd],
      [px + hw, pz + hd, px - hw, pz + hd],
      [px - hw, pz + hd, px - hw, pz - hd],
    ];
    for (const [x0, z0, x1, z1] of sides) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 2.4));
      const ang = Math.atan2(x1 - x0, z1 - z0);
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const fx = x0 + (x1 - x0) * t;
        const fz = z0 + (z1 - z0) * t;
        const fy = terrainH(fx, fz);
        if (random() < 0.12) {
          prev = null; // 이 빠진 구간 — 가로대도 함께 끊는다
          continue;
        }
        fencePosts.push({
          p: [fx, fy + 0.55, fz],
          r: [rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05)],
          s: [1, rnd(0.9, 1.1), 1],
          c: 0x5c5244,
        });
        if (prev) {
          const mx = (fx + prev[0]) / 2;
          const mz = (fz + prev[2]) / 2;
          const seg = Math.hypot(fx - prev[0], fz - prev[2]);
          fenceRails.push({
            p: [mx, (fy + prev[1]) / 2 + 0.82, mz],
            r: [0, ang, 0],
            s: [1, 1, seg / 2.4],
            c: 0x655a4a,
          });
        }
        prev = [fx, fy, fz];
      }
    }
  };

  /** kind: 0 농가 / 1 창고 / 2 폐가 */
  const makeHouse = (px: number, pz: number, kind: 0 | 1 | 2): void => {
    const y = terrainH(px, pz);
    const w = kind === 1 ? rnd(16, 26) : rnd(7, 12);
    const d = kind === 1 ? rnd(20, 34) : rnd(8, 14);
    const h = kind === 1 ? rnd(6, 9) : rnd(3.2, 4.6);
    /**
     * **방향** — 모든 집이 축 정렬이었다(회전 코드가 아예 없었다). 상공에서 집 19채가
     * 전부 같은 쪽을 보고 있으면 그 한 가지만으로 씬이 프로시저럴로 읽힌다.
     * 농가는 길·바람·볕을 보고 앉으므로 완전 무작위는 아니다 — 대략 두 방향에 몰리되 흔들린다.
     */
    const yaw = (random() < 0.62 ? 0 : Math.PI / 2) + rnd(-0.5, 0.5);

    /**
     * **기초** — 벽 상자를 지표에 얹기만 하면 경사에서 한쪽 귀퉁이가 뜬다(능선 도입 후 심해짐).
     * 실제 건물은 땅을 고르고 기초를 놓는다. 벽보다 약간 넓은 기단을 **묻어** 둔다:
     * 바닥선이 지형에 먹히면서 접지가 해결되고, 벽 아래 어두운 띠가 생겨 무게가 붙는다.
     */
    plinths.push({
      p: [px, y + 0.35, pz],
      r: [0, yaw, 0],
      s: [w * 1.08, 2.2, d * 1.08],
      c: 0xffffff, // 색은 콘크리트 맵이 맡는다 (인스턴스 색과 맵은 곱해진다)
    });

    const walls = registry.registerAs(
      new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        kind === 1 ? WALL_BIG[(random() * 2) | 0] : WALL_SM[(random() * 3) | 0],
      ),
      'wall',
    );
    walls.position.set(px, y + h / 2 + 1.1, pz);
    walls.rotation.y = yaw;
    // 폐가는 내려앉는다 — 반듯한 폐허는 없다
    if (kind === 2) walls.rotation.z = rnd(-0.035, 0.035);
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);
    ao.add(px, pz, Math.max(w, d) * 0.85);

    if (kind !== 2) {
      // 박공지붕 = 삼각기둥(원기둥 3분할)을 눕힌 것.
      // 물매 0.34→0.26, 눌림 0.66→0.56 — 벽 대비 지붕이 과하게 크던 것 수정(점검 스윕).
      // 처마는 벽보다 6% 넓게 내밀어 벽 텍스처의 처마 그늘과 이어진다.
      const rw = Math.hypot(w / 2, w * 0.26) * 1.06;
      const roof = registry.register(
        new THREE.Mesh(new THREE.CylinderGeometry(rw, rw, d * 1.08, 3), ROOF[kind === 1 ? 1 : 0]),
        kind === 1 ? HEAT.roofMetal : HEAT.roof,
      );
      // 지붕은 벽과 같은 방향으로 앉아야 한다 — 회전 순서상 Y 를 먼저, 그다음 X 눕히기
      roof.rotation.set(-Math.PI / 2, 0, 0);
      roof.rotation.order = 'YXZ';
      roof.rotation.y = yaw;
      roof.scale.set(1, 1, 0.56);
      roof.position.set(px, y + h + w * 0.115 + 1.1, pz);
      roof.castShadow = true;
      roof.receiveShadow = true;
      scene.add(roof);
      if (kind === 0 && random() < 0.6) makeYardFence(px, pz, w, d);
      if (kind === 0 && random() < 0.7) {
        chimneys.push({
          p: [px + rnd(-w * 0.25, w * 0.25), y + h + 2.7, pz + rnd(-d * 0.2, d * 0.2)],
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

  /**
   * **마을 군집** (아트 패스 5).
   *
   * 이전에는 집 19채를 (-340..60, -340..340) 에 균등 살포했다. 결과는 벌판에 홀로
   * 선 집들 — 초목의 균일 살포와 **정확히 같은 병**이다(근접 실측). 사람은 모여 산다:
   * 농가 몇 채와 헛간 하나가 **같은 마당·같은 진입로**를 두고 앉고, 그 사이에 폐가가 섞인다.
   * 군집 자체가 정보다 — "여기 사람이 살았다"는 문장은 집 한 채로는 안 만들어진다.
   */
  /**
   * ⚠️ 마을 **구성은 고정**이다(농가 수·헛간·폐가 유무). 처음엔 이걸 난수로 뽑았다가
   * 장애물 수가 시드마다 달라져 `world.spec` 이 잡았다 — 개수가 흔들리면 드로우콜 예산과
   * 미션 난이도가 같이 흔들린다. **흔들려도 되는 것은 자리와 방향뿐이다.**
   */
  const hamlets: { x: number; z: number; houses: number; barn: boolean; ruin: boolean }[] = [
    { x: -96, z: 108, houses: 3, barn: true, ruin: true },
    { x: -238, z: -172, houses: 2, barn: true, ruin: false },
    { x: -34, z: -286, houses: 3, barn: false, ruin: true },
    { x: -296, z: 232, houses: 2, barn: true, ruin: true },
    { x: 22, z: 44, houses: 2, barn: false, ruin: false },
  ];
  for (const h of hamlets) {
    // 마을 하나가 바라보는 방향 — 진입로 쪽. 집들이 대체로 이 축을 따라 앉는다.
    const axis = rnd(0, Math.PI * 2);
    for (let i = 0; i < h.houses; i++) {
      // 마당을 사이에 두고 축을 따라 늘어선다
      const t = (i - (h.houses - 1) / 2) * rnd(22, 34);
      const off = rnd(-14, 14);
      makeHouse(h.x + Math.cos(axis) * t - Math.sin(axis) * off, h.z + Math.sin(axis) * t + Math.cos(axis) * off, 0);
    }
    // 헛간은 마당 건너편에 — 농가와 마주 본다
    if (h.barn) {
      const bo = rnd(38, 58);
      makeHouse(h.x - Math.sin(axis) * bo, h.z + Math.cos(axis) * bo, 1);
    }
    // 폐가 — 마을 언저리. 성한 집 옆의 무너진 집이 전쟁을 말한다.
    if (h.ruin) {
      const ro = rnd(44, 72);
      const ra = axis + rnd(1.6, 2.6);
      makeHouse(h.x + Math.cos(ra) * ro, h.z + Math.sin(ra) * ro, 2);
    }
  }
  // 외딴 농가 몇 채 — 전부 모여 있으면 그건 그것대로 규칙적이다
  for (let i = 0; i < 3; i++) makeHouse(rnd(-330, 40), rnd(-330, 330), 0);

  const opts = { registry, scene };
  // 기단 — 단위 상자에 필지별 크기를 인스턴스 스케일로 준다. 콘크리트 물때가 접지를 돕는다.
  const plinthTex = concreteTex();
  plinthTex.repeat.set(3, 1);
  buildInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: plinthTex, color: 0xffffff }), plinths, {
    heat: HEAT.wall,
    ...opts,
  });
  buildInstanced(new THREE.BoxGeometry(0.8, 2.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xffffff }), chimneys, {
    heat: HEAT.chimney,
    ...opts,
  });
  buildInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), rubble, {
    heat: HEAT.rubble,
    ...opts,
  });
  // 울타리 — 기둥은 그림자를 끄지 않고, 가로대는 끈다(1024 섀도우맵에서 얇은 가로대는 지글거린다)
  buildInstanced(new THREE.BoxGeometry(0.14, 1.1, 0.14), new THREE.MeshLambertMaterial({ color: 0xffffff }), fencePosts, {
    heat: HEAT.trunk,
    ...opts,
  });
  buildInstanced(new THREE.BoxGeometry(0.07, 0.09, 2.4), new THREE.MeshLambertMaterial({ color: 0xffffff }), fenceRails, {
    heat: HEAT.trunk,
    shadow: false,
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
    /**
     * ⚠️ 인스턴스 색과 맵은 **곱해진다.** 맵 없이 회색 틴트(0x6d6d63 ≈ 0.43)를 쓰던 자리에
     * 콘크리트 맵(≈0.52)을 얹었더니 0.22 가 되어 기둥이 새까매졌다(실측).
     * 맵이 색을 맡으면 틴트는 흰색이어야 한다. 밝기 편차는 맵 안에서 준다.
     */
    list.push({ p: [px, ty, pz], r: [0, 0, 0], s: [1, 1, 1], c: 0xffffff });
    obstacles.push({
      position: new THREE.Vector3(px, ty, pz),
      radius: 2.4,
      height: 36,
      box: new THREE.Box3(new THREE.Vector3(px - 1, ty - 18, pz - 1), new THREE.Vector3(px + 1, ty + 18, pz + 1)),
    });
  }
  // 민짜 회색 상자로 두면 근접에서 "미완성 오브젝트"로 읽힌다 — 물때·이음선을 입힌다
  const tex = concreteTex();
  tex.repeat.set(1, 9); // 36m 기둥에 4m 주기
  buildInstanced(new THREE.BoxGeometry(2, 36, 2), new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff }), list, {
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
