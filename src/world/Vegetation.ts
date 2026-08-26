import * as THREE from 'three';
import { fbm, random, rnd } from './noise';
import { grassTex } from './textures';
import { terrainH } from './Terrain';
import { buildInstanced, type InstanceSpec } from './Instancing';
import type { ThermalRegistry } from './ThermalRegistry';
import type { AoCollector } from './Ao';
import { HEAT } from '@/data/thermal';

/**
 * 식생. 풀 18k×2매 + 덤불 5.2k + 수목 3종이 전부 인스턴싱으로 **6 드로우콜**에 들어간다.
 * 개별 Mesh 로 만들면 여기서만 수만 콜이 난다.
 */

// 아트 패스 1: 채도를 뺀 회록. 선명한 초록은 "살아 있는 여름"이라 전장 팔레트에서 튄다.
const CROWNS = [0x4c5a3a, 0x445236, 0x555f3e, 0x5e6042, 0x414f38, 0x666747, 0x525c3a];
const BARK = [0x4d3d2a, 0x574734, 0x413425, 0x5f5140];
const GRASS_N = 18000;

export interface VegetationHandles {
  grass: THREE.InstancedMesh;
  bush: THREE.InstancedMesh;
  /** 풀 흔들림 셰이더의 시간 uniform. 매 프레임 갱신한다. */
  windUniform: { value: number } | null;
}

export function buildVegetation(
  scene: THREE.Scene,
  registry: ThermalRegistry,
  ao: AoCollector,
): VegetationHandles {
  const { grass, windUniform } = buildGrass(scene, registry);
  const bush = buildBushes(scene, registry);
  buildTrees(scene, registry, ao);
  return { grass, bush, windUniform };
}

function buildGrass(
  scene: THREE.Scene,
  registry: ThermalRegistry,
): { grass: THREE.InstancedMesh; windUniform: { value: number } | null } {
  const texBlade = grassTex();
  const geo = new THREE.PlaneGeometry(2.6, 2.0);
  const mat = new THREE.MeshLambertMaterial({
    map: texBlade,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.35,
    depthWrite: true,
  });

  // 바람 흔들림은 정점 셰이더에 주입한다. 인스턴스 위치로 위상을 흩어
  // 전체가 한 박자로 움직이지 않게 한다.
  let windUniform: { value: number } | null = null;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = { value: 0 };
    windUniform = sh.uniforms.uWind as { value: number };
    sh.vertexShader =
      'uniform float uWind;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float sway=(position.y+1.0)*0.5;
         vec3 wp=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
         float ph=wp.x*0.22+wp.z*0.17;
         transformed.x+=sin(uWind*1.7+ph)*0.42*sway + sin(uWind*4.1+ph*2.3)*0.12*sway;
         transformed.z+=cos(uWind*1.3+ph*0.8)*0.26*sway;`,
      );
  };

  const grass = new THREE.InstancedMesh(geo, mat, GRASS_N * 2);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let idx = 0;
  for (let i = 0; i < GRASS_N; i++) {
    const x = rnd(-460, 460);
    const z = rnd(-460, 460);
    if (Math.abs(x - 120) < 9) continue; // 도로 위 제외
    const y = terrainH(x, z);
    const s = rnd(0.6, 1.9);
    const dry = fbm(x * 0.01 + 100, z * 0.01 + 100, 3) < 0.42; // 지면 패치와 색 맞춤
    col.setRGB(
      dry ? rnd(0.62, 0.8) : rnd(0.3, 0.46),
      dry ? rnd(0.55, 0.7) : rnd(0.42, 0.58),
      dry ? rnd(0.28, 0.4) : rnd(0.16, 0.26),
    );
    for (let k = 0; k < 2; k++) {
      // 교차 2매 빌보드
      dummy.position.set(x, y + 1.0 * s, z);
      dummy.rotation.set(0, (k ? Math.PI / 2 : 0) + rnd(-0.3, 0.3), rnd(-0.08, 0.08));
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      grass.setMatrixAt(idx, dummy.matrix);
      grass.setColorAt(idx, col);
      idx++;
    }
  }
  grass.count = idx;
  grass.castShadow = false;
  grass.receiveShadow = false;
  scene.add(grass);

  registry.pairs.push({
    mesh: grass,
    normal: mat,
    thermal: new THREE.MeshBasicMaterial({
      map: texBlade,
      color: new THREE.Color(HEAT.grass, HEAT.grass, HEAT.grass),
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.35,
      fog: true,
    }),
  });

  return { grass, windUniform };
}

/**
 * 울퉁불퉁 정이십면체 — 매끈한 기하 원형이 "로우폴리 에셋" 느낌의 마지막 잔재였다.
 * 정점을 **위치 해시**로 방사형 변형한다: PolyhedronGeometry 는 면마다 정점이 복제돼 있어
 * 인덱스로 밀면 면이 찢어진다 — 같은 위치는 같은 오프셋을 받아야 물샐틈없이 유지된다.
 * 삼각형 수는 그대로(20)라 예산 비용이 0이다. salt 로 변종을 만든다.
 */
function lumpyIcosahedron(radius: number, salt: number, amount: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + salt) * 43758.5453;
    const k = 1 - amount / 2 + (h - Math.floor(h)) * amount;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBushes(scene: THREE.Scene, registry: ThermalRegistry): THREE.InstancedMesh {
  // MeshLambertMaterial 은 flatShading 을 지원하지 않는다 — 하네스가 경고 수백 회로 잡았던 자리.
  // 형태 변종 3종 — 5,200개가 전부 같은 형태면 색을 바꿔도 "복붙"으로 읽힌다. 삼각형 수는 동일.
  const variants = [0, 1, 2].map((salt) => {
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true });
    return new THREE.InstancedMesh(lumpyIcosahedron(1.6, salt * 17.3, 0.55), mat, 1800);
  });
  const counts = [0, 0, 0];

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < 5200; i++) {
    const x = rnd(-470, 470);
    const z = rnd(-470, 470);
    if (Math.abs(x - 120) < 11) continue;
    const y = terrainH(x, z);
    const dry = fbm(x * 0.01 + 100, z * 0.01 + 100, 3) < 0.42;
    // 아트 패스 1: 녹색 채도를 뺀다. 민트빛 매끈한 덩어리가 "로우폴리 에셋"의 주범이었다.
    col.setRGB(
      dry ? rnd(0.5, 0.62) : rnd(0.26, 0.35),
      dry ? rnd(0.46, 0.56) : rnd(0.3, 0.4),
      dry ? rnd(0.28, 0.36) : rnd(0.17, 0.24),
    );
    dummy.position.set(x, y + rnd(0.5, 1.3), z);
    dummy.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    dummy.scale.set(rnd(0.7, 2.1), rnd(0.5, 1.2), rnd(0.7, 2.1));
    dummy.updateMatrix();
    const vi = i % 3;
    if (counts[vi] >= 1800) continue;
    variants[vi].setMatrixAt(counts[vi], dummy.matrix);
    variants[vi].setColorAt(counts[vi], col);
    counts[vi]++;
  }
  for (let vi = 0; vi < 3; vi++) {
    const mesh = variants[vi];
    mesh.count = counts[vi];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    registry.registerAs(mesh, 'bush');
  }
  return variants[0];
}

function buildTrees(scene: THREE.Scene, registry: ThermalRegistry, ao: AoCollector): void {
  const trunks: InstanceSpec[] = [];
  const crowns: InstanceSpec[] = [];
  const dead: InstanceSpec[] = [];
  const branches: InstanceSpec[] = [];

  /** kind: 0 활엽수 / 1 포플러 / 2 고사목 */
  const makeTree = (px: number, pz: number, kind: 0 | 1 | 2): void => {
    const y = terrainH(px, pz);
    const s = rnd(0.75, 1.6);
    ao.add(px, pz, kind === 2 ? 2.2 : (kind === 1 ? 2.6 : 4.2) * s);

    if (kind === 2) {
      const h = rnd(6, 10);
      dead.push({ p: [px, y + h / 2, pz], r: [0, rnd(0, 6.28), rnd(-0.05, 0.05)], s: [1, h / 8, 1], c: 0x6a5c48 });
      const nb = 3 + ((random() * 3) | 0);
      for (let b = 0; b < nb; b++) {
        const a = rnd(0, 6.28);
        const tilt = rnd(0.6, 1.25);
        const hh = y + h * rnd(0.55, 0.95);
        branches.push({
          p: [px + Math.cos(a) * 1.2, hh + 0.8, pz + Math.sin(a) * 1.2],
          r: [tilt * Math.sin(a), a, tilt * Math.cos(a)],
          s: [1, rnd(0.7, 1.2), 1],
          c: 0x6a5c48,
        });
      }
      return;
    }

    const tall = kind === 1;
    const th = tall ? 11 * s : 7 * s;
    trunks.push({
      p: [px, y + th / 2, pz],
      r: [0, rnd(0, 6.28), 0],
      s: [s, th / 7, s],
      c: BARK[(random() * BARK.length) | 0],
    });
    const cc = CROWNS[(random() * CROWNS.length) | 0];
    const nBlob = tall ? 4 : 3 + ((random() * 3) | 0);
    for (let b = 0; b < nBlob; b++) {
      const rad = tall ? rnd(1.1, 1.8) * s : rnd(1.6, 2.9) * s;
      const ox = tall ? rnd(-0.5, 0.5) * s : rnd(-2.1, 2.1) * s;
      const oz = tall ? rnd(-0.5, 0.5) * s : rnd(-2.1, 2.1) * s;
      const oy = tall ? th * (0.45 + b * 0.16) : th * rnd(0.82, 1.28);
      crowns.push({
        p: [px + ox, y + oy, pz + oz],
        r: [rnd(0, 3), rnd(0, 3), rnd(0, 3)],
        s: [rad * rnd(0.85, 1.2), rad * rnd(0.7, 1.05), rad * rnd(0.85, 1.2)],
        c: cc,
      });
    }
  };

  /**
   * 띠 형태 배치. 06 문서 E6 가 "산발 배치 → 띠(treeline)"를 지시한 항목이며,
   * 띠형 수목선은 은폐·매복 지형이라 M2/M7 미션 설계의 전제다.
   */
  const band = (x0: number, z0: number, dx: number, dz: number, n: number, sp: number): void => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = x0 + dx * t + rnd(-sp, sp);
      const pz = z0 + dz * t + rnd(-sp, sp);
      const r = random();
      makeTree(px, pz, r < 0.62 ? 0 : r < 0.88 ? 1 : 2);
    }
  };

  // 도로 양옆 2줄(밀집) + 들판 사선 2줄(성김)
  band(98, -700, 0, 1400, 120, 6);
  band(144, -700, 0, 1400, 120, 6);
  band(-380, 120, 420, 60, 80, 16);
  band(-60, -420, 300, -90, 70, 16);

  const opts = { registry, scene };
  const white = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
  buildInstanced(new THREE.CylinderGeometry(0.26, 0.62, 7, 6), white(), trunks, { heat: HEAT.trunk, ...opts });
  // 수관도 형태 변종 2종 — 나무마다 블롭 4~6개가 서로 다른 변종을 섞어 쓴다
  buildInstanced(
    lumpyIcosahedron(1, 5.7, 0.5),
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true }),
    crowns.filter((_, i) => i % 2 === 0),
    { heat: HEAT.canopy, ...opts },
  );
  buildInstanced(
    lumpyIcosahedron(1, 11.9, 0.5),
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true }),
    crowns.filter((_, i) => i % 2 === 1),
    { heat: HEAT.canopy, ...opts },
  );
  buildInstanced(new THREE.CylinderGeometry(0.16, 0.5, 8, 6), white(), dead, { heat: HEAT.deadwood, ...opts });
  buildInstanced(new THREE.CylinderGeometry(0.07, 0.16, 3.4, 4), white(), branches, {
    heat: HEAT.deadwood,
    ...opts,
  });
}
