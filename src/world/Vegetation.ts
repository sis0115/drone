import * as THREE from 'three';
import { fbm, random, rnd } from './noise';
import { grassTex } from './textures';
import { terrainH } from './Terrain';
import { grassDensity, sampleByDensity, vegDensity } from './Landcover';
import { buildInstanced, type InstanceSpec } from './Instancing';
import type { ThermalRegistry } from './ThermalRegistry';
import type { AoCollector } from './Ao';
import { HEAT } from '@/data/thermal';

/**
 * 식생. 풀 18k×2매 + 덤불 5.2k + 수목 3종이 전부 인스턴싱으로 **6 드로우콜**에 들어간다.
 * 개별 Mesh 로 만들면 여기서만 수만 콜이 난다.
 */

// 아트 패스 1: 채도를 뺀 회록. 선명한 초록은 "살아 있는 여름"이라 전장 팔레트에서 튄다.
// 아트 패스 5: 회올리브로 한 번 더. 수관은 화면에서 면적이 커서 채도가 조금만 높아도 튄다.
const CROWNS = [0x4e563e, 0x47503b, 0x555b43, 0x5c5d46, 0x454c3c, 0x63634b, 0x53573f];
const BARK = [0x4d3d2a, 0x574734, 0x413425, 0x5f5140];
/** 지형 해상도(SEG 150)에 삼각형을 내주고 줄였다 — 원경의 풀은 안개에 먹혀 안 보인다. */
const GRASS_N = 13000;

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
    // 균일 살포 → 토지 피복 기반(Landcover). 갈아엎은 구획은 성글고 묵밭은 무성하다.
    const spot = sampleByDensity(rnd, random, grassDensity, 460);
    if (!spot) continue;
    const { x, z } = spot;
    if (Math.abs(x - 120) < 9) continue; // 도로 위 제외
    const y = terrainH(x, z);
    const s = rnd(0.6, 1.9);
    const dry = fbm(x * 0.01 + 100, z * 0.01 + 100, 3) < 0.42; // 지면 패치와 색 맞춤
    // 아트 패스 5: 채도를 한 번 더 뺀다. 흐린 날 들판의 초록은 회올리브에 가깝다 —
    // 녹(g)이 적(r)보다 크게 앞서면 그 순간 "게임 잔디"로 읽힌다.
    col.setRGB(
      dry ? rnd(0.6, 0.76) : rnd(0.34, 0.46),
      dry ? rnd(0.56, 0.7) : rnd(0.4, 0.52),
      dry ? rnd(0.32, 0.43) : rnd(0.22, 0.31),
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
/** 수관 덩어리 — 사방으로 고르게 흩는 구형 요철. 수관은 공중에 뜬 잎 뭉치라 밑면도 둥글다. */
function blobGeometry(radius: number, salt: number, amount: number): THREE.BufferGeometry {
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

/**
 * 덤불 형태 — **공이 아니라 땅에 앉은 더미**다 (아트 패스 5).
 *
 * 이전 구현은 정이십면체 12 정점을 사방으로 ±27.5% 흩어 **가시별**이 됐다(근접 실측).
 * 20 삼각형이라는 예산은 그대로 두고 실루엣만 고친다:
 * 1. 아래 반쪽을 **접어 올린다** — 덤불의 밑면은 땅이라 둥글 이유가 없다
 * 2. 거칠기를 **윗면에만** 준다 — 실루엣의 정보는 윗선에 있고, 아래는 매끈해야 앉아 보인다
 * 3. 진폭을 0.55 → 0.34 로 — 가시가 아니라 잎 뭉치의 요철이다
 */
function shrubGeometry(radius: number, salt: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const up = Math.max(0, v.y / radius); // 0 = 밑면, 1 = 꼭대기
    const rough = 0.12 + up * 0.34;
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + salt) * 43758.5453;
    const k = 1 - rough / 2 + (h - Math.floor(h)) * rough;
    const y = v.y < 0 ? v.y * 0.34 : v.y; // 밑면을 접어 올린다
    pos.setXYZ(i, v.x * k, y * k * 0.78, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBushes(scene: THREE.Scene, registry: ThermalRegistry): THREE.InstancedMesh {
  // MeshLambertMaterial 은 flatShading 을 지원하지 않는다 — 하네스가 경고 수백 회로 잡았던 자리.
  // 형태 변종 3종 — 5,200개가 전부 같은 형태면 색을 바꿔도 "복붙"으로 읽힌다. 삼각형 수는 동일.
  const variants = [0, 1, 2].map((salt) => {
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true });
    return new THREE.InstancedMesh(shrubGeometry(1.6, salt * 17.3), mat, 1800);
  });
  const counts = [0, 0, 0];

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < 5200; i++) {
    /**
     * **밭 안은 비우고 경계에 세운다** (Landcover.vegDensity).
     * 균일 살포일 때 상공에서 덤불이 노이즈로 읽히던 것의 원인이 배치였다 —
     * 개수도 삼각형도 그대로고, 자리만 바뀐다.
     */
    const spot = sampleByDensity(rnd, random, vegDensity, 470);
    if (!spot) continue;
    const { x, z } = spot;
    if (Math.abs(x - 120) < 11) continue;
    const y = terrainH(x, z);
    const dry = fbm(x * 0.01 + 100, z * 0.01 + 100, 3) < 0.42;
    // 아트 패스 1: 녹색 채도를 뺀다. 민트빛 매끈한 덩어리가 "로우폴리 에셋"의 주범이었다.
    col.setRGB(
      dry ? rnd(0.48, 0.6) : rnd(0.28, 0.36),
      dry ? rnd(0.45, 0.55) : rnd(0.29, 0.38),
      dry ? rnd(0.3, 0.38) : rnd(0.2, 0.27),
    );
    // 밑면을 접은 형태라 중심을 낮춰야 땅에 붙는다(예전 값은 공 중심 기준이었다)
    dummy.position.set(x, y + rnd(0.25, 0.7), z);
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
    /**
     * ⚠️ 밑동에 작은 패치를 겹쳐 "짙은 심"을 만들려다 **하드한 검은 원반**이 찍혔다(실측).
     * AO 텍스처의 감쇠가 반경에 비례하므로 작게 쓰면 가장자리가 서 버린다.
     * 접지감은 패치를 더 넣어서가 아니라 **수관 실루엣**으로 푼다.
     */
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
    // 활엽수 줄기를 세웠다(7→8.6). 수관 폭이 줄기 높이와 같으면 **버섯**이 된다 —
    // 줄기가 보일수록 나무로 읽힌다.
    const th = tall ? 11 * s : 8.6 * s;
    trunks.push({
      p: [px, y + th / 2, pz],
      r: [0, rnd(0, 6.28), 0],
      s: [s, th / 7, s],
      c: BARK[(random() * BARK.length) | 0],
    });
    const cc = CROWNS[(random() * CROWNS.length) | 0];
    /**
     * 수관 — **버섯을 고친다** (아트 패스 4).
     *
     * 이전 배치는 덩어리를 수평으로 ±2.1s 흩고 높이를 줄기 끝(th 의 0.82~1.28)에만 뒀다.
     * 결과는 가는 기둥 위에 얹힌 **납작한 원반**, 즉 저폴리 에셋의 전형이었다(실측).
     * 셋을 바꾼다:
     * 1. **중심 덩어리 하나를 크게**, 나머지를 작게 — 실루엣이 울퉁불퉁해진다
     * 2. 수평 산포를 줄이고 **수직으로 흩는다** — 수관은 원반이 아니라 덩어리다
     * 3. 수관을 줄기 쪽으로 **내려** 겹친다 — 갓과 기둥 사이 틈이 "에셋"으로 읽힌다
     */
    const nBlob = tall ? 5 : 4 + ((random() * 3) | 0);
    for (let b = 0; b < nBlob; b++) {
      const core = b === 0;
      // 수관 폭을 줄인다 — 지름이 줄기 높이의 절반쯤이어야 실루엣이 나무다
      const rad = tall
        ? (core ? rnd(1.3, 1.8) : rnd(0.8, 1.3)) * s
        : (core ? rnd(1.7, 2.4) : rnd(0.85, 1.6)) * s;
      const spread = tall ? 0.4 : core ? 0.3 : 1.15;
      const ox = rnd(-spread, spread) * s;
      const oz = rnd(-spread, spread) * s;
      const oy = tall
        ? th * (0.42 + b * 0.15)
        : th * (core ? 0.92 : rnd(0.76, 1.2)); // 위아래로 흩어 덩어리를 만든다
      crowns.push({
        p: [px + ox, y + oy, pz + oz],
        r: [rnd(0, 3), rnd(0, 3), rnd(0, 3)],
        // 세로로도 부풀린다 — y 를 눌러 두면 어떤 각도에서도 원반이다
        s: [rad * rnd(0.82, 1.15), rad * rnd(0.86, 1.32), rad * rnd(0.82, 1.15)],
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
    blobGeometry(1, 5.7, 0.38),
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 0, flatShading: true }),
    crowns.filter((_, i) => i % 2 === 0),
    { heat: HEAT.canopy, ...opts },
  );
  buildInstanced(
    blobGeometry(1, 11.9, 0.38),
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
