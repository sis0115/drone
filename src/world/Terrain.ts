import * as THREE from 'three';
import { fbm } from './noise';
import { fieldValue, hedgerow } from './Landcover';
import { dirtTex, groundTex, roadTex, texMat } from './textures';
import type { ThermalRegistry } from './ThermalRegistry';

/**
 * 지형·수면·도로. 전부 지형 높이를 따라간다.
 * `terrainH` 는 비행 물리(고도 추종)와 소품 배치가 함께 쓰는 단일 출처다 —
 * 여기 계수를 바꾸면 지형과 비행이 동시에 달라진다.
 */

export const TER = 1600;
/**
 * 110 이면 한 칸이 14.5m — 능선이 렌더될 수 없는 해상도였다(상공 실측: 지형이 평평해 보임).
 * 150 이면 10.7m. 늘어난 삼각형(24k→45k)은 풀에서 뺐다(GRASS_N 18000→13000).
 */
export const SEG = 150;

/** 지형이 지평선 스커트(y=0, 안쪽 반경 820)와 만나는 구간 — 이음매를 감춘다. */
const FADE_FROM = 600;
const FADE_TO = 780;

/**
 * 월드 좌표의 지면 높이(m).
 *
 * 세 항을 겹친다 (아트 패스 4):
 * - **능선** — ridged 노이즈. `1-|2n-1|` 로 마루를 세운다. 파장 ~830m 라
 *   경사는 0.16 수준(비행 테스트가 허용하는 0.3 이내)인데 **스카이라인이 생긴다**.
 *   이전에는 이 항이 없어서 지평선이 자로 그은 듯 평평했다.
 * - **기복** — 기존 항. 능선에 자리를 내주느라 진폭을 16 → 11 로 줄였다.
 * - **잔주름** — 그대로.
 *
 * 가장자리에서는 0 으로 잦아든다 — 지평선 스커트가 y=0 이라 높이가 남으면 절벽이 된다.
 */
export function terrainH(x: number, z: number): number {
  const ridged = 1 - Math.abs(2 * fbm(x * 0.0012 + 900, z * 0.0012 + 900, 3) - 1);
  const h =
    Math.pow(ridged, 1.7) * 30 - 9 +
    fbm(x * 0.0035 + 100, z * 0.0035 + 100, 4) * 11 +
    fbm(x * 0.017 + 50, z * 0.017 + 50, 3) * 2.0;
  const r = Math.hypot(x, z);
  if (r <= FADE_FROM) return h;
  const k = Math.max(0, 1 - (r - FADE_FROM) / (FADE_TO - FADE_FROM));
  return h * k * k * (3 - 2 * k); // smoothstep
}

export interface TerrainHandles {
  ground: THREE.Mesh;
  water: THREE.Mesh;
  road: THREE.Mesh;
  dirtPaths: THREE.Mesh[];
}

export function buildTerrain(scene: THREE.Scene, registry: ThermalRegistry): TerrainHandles {
  const texGround = groundTex(1024);
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
    // 필지 고유값 — Landcover 의 격자와 **같은 출처**를 쓴다.
    // 초목이 서는 경계와 땅 색이 갈리는 경계가 어긋나면 둘 다 노이즈로 읽힌다.
    const field = fieldValue(x, z);
    /**
     * **필지마다 작물 상태가 다르다** — 밝기만 흔들었더니 지면이 한 가지 색으로
     * 균일해졌다(실측). 농지가 농지로 읽히는 건 명도차가 아니라 **색상차**다:
     * 갈아엎은 맨흙 / 그루터기 / 자란 작물 / 묵정밭이 필지 단위로 갈린다.
     * 팔레트는 전장의 먼지빛 안에 둔다 — 선명한 초록은 "휴가 영상"이 된다(아트 패스 1).
     */
    const crop =
      field < 0.3
        ? [1.02, 0.85, 0.63] // 갈아엎은 맨흙
        : field < 0.55
          ? [1.24, 1.14, 0.82] // 밀 그루터기 — 마르고 밝다
          : field < 0.78
            ? [0.82, 0.95, 0.6] // 자란 작물 — 채도 낮은 녹
            : [0.95, 0.98, 0.72]; // 묵정밭
    // 국소 요동은 남긴다 — 필지 안이 완전히 균일하면 색종이가 된다
    const t = Math.max(0, Math.min(1, (patch - 0.38) * 3.2));
    let r = crop[0] * (1.06 - t * 0.16);
    let g = crop[1] * (1.02 - t * 0.06);
    let b = crop[2] * (1.0 - t * 0.14);
    /**
     * 필지별 밝기 차 — **지면의 대스케일 구조는 전부 여기서 만든다**(텍스처는 26.7m 마다
     * 반복되므로 대스케일을 그릴 수 없다). 정점 간격 10.7m, 필지 96m 라 필지당 9칸이다.
     */
    // 색상은 작물이 정했으니 명도는 살짝만 — 두 축이 겹치면 색종이가 된다
    const fv = 0.9 + field * 0.2;
    // 필지 경계의 농로·도랑 — 어두운 선 하나가 "사람이 나눈 땅"을 만든다
    const lane = 1 - hedgerow(x, z) * 0.26;
    r *= fv * lane;
    g *= fv * lane;
    b *= fv * lane * 0.98;
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
  const texRoad = roadTex(512);
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
  const texDirt = dirtTex(512);
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
