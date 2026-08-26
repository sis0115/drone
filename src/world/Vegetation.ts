import * as THREE from 'three';
import { fbm, rnd } from './noise';
import { grassTex } from './textures';
import { terrainH } from './Terrain';
import { buildInstanced, type InstanceSpec } from './Instancing';
import type { ThermalRegistry } from '@/render/ThermalRegistry';
import type { AoCollector } from './Ao';

/**
 * 식생. 풀 18k×2매 + 덤불 5.2k + 수목 3종이 전부 인스턴싱으로 **6 드로우콜**에 들어간다.
 * 개별 Mesh 로 만들면 여기서만 수만 콜이 난다.
 */

const CROWNS = [0x4a6330, 0x3f5a2c, 0x577038, 0x6b6f35, 0x3a5230, 0x7a7a3c, 0x5d6b2e];
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
      color: new THREE.Color(0.4, 0.4, 0.4),
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.35,
      fog: true,
    }),
  });

  return { grass, windUniform };
}

function buildBushes(scene: THREE.Scene, registry: ThermalRegistry): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1.6, 0);
  // MeshLambertMaterial 은 flatShading 을 지원하지 않는다 — 하네스가 경고 수백 회로 잡았던 자리.
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true });
  const bush = new THREE.InstancedMesh(geo, mat, 5200);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let idx = 0;
  for (let i = 0; i < 5200; i++) {
    const x = rnd(-470, 470);
    const z = rnd(-470, 470);
    if (Math.abs(x - 120) < 11) continue;
    const y = terrainH(x, z);
    const dry = fbm(x * 0.01 + 100, z * 0.01 + 100, 3) < 0.42;
    col.setRGB(
      dry ? rnd(0.55, 0.72) : rnd(0.24, 0.38),
      dry ? rnd(0.5, 0.64) : rnd(0.36, 0.5),
      dry ? rnd(0.26, 0.38) : rnd(0.14, 0.24),
    );
    dummy.position.set(x, y + rnd(0.5, 1.3), z);
    dummy.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    dummy.scale.set(rnd(0.7, 2.1), rnd(0.5, 1.2), rnd(0.7, 2.1));
    dummy.updateMatrix();
    bush.setMatrixAt(idx, dummy.matrix);
    bush.setColorAt(idx, col);
    idx++;
  }
  bush.count = idx;
  bush.castShadow = true;
  bush.receiveShadow = true;
  scene.add(bush);

  registry.register(bush, 0.32);
  return bush;
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
      const nb = 3 + ((Math.random() * 3) | 0);
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
      c: BARK[(Math.random() * BARK.length) | 0],
    });
    const cc = CROWNS[(Math.random() * CROWNS.length) | 0];
    const nBlob = tall ? 4 : 3 + ((Math.random() * 3) | 0);
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
      const r = Math.random();
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
  buildInstanced(new THREE.CylinderGeometry(0.26, 0.62, 7, 6), white(), trunks, { heat: 0.42, ...opts });
  buildInstanced(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true }),
    crowns,
    { heat: 0.34, ...opts },
  );
  buildInstanced(new THREE.CylinderGeometry(0.16, 0.5, 8, 6), white(), dead, { heat: 0.46, ...opts });
  buildInstanced(new THREE.CylinderGeometry(0.07, 0.16, 3.4, 4), white(), branches, { heat: 0.46, ...opts });
}
