import * as THREE from 'three';
import { fbm, random, rnd } from './noise';
import type { ThermalRegistry } from './ThermalRegistry';

/**
 * 원경 구조 — **지평선에 형태를 준다** (아트 패스 4).
 *
 * 실측 스크린샷에서 가장 크게 비어 있던 것: 300m 너머가 완전히 텅 빈 띠였고
 * 지평선이 자로 그은 듯 평평했다. 실제 전장 영상에는 **언제나** 먼 능선이나
 * 수목선이 흐리게 걸려 있다 — 그게 "여기가 어딘가의 한복판"이라는 감각을 만든다.
 *
 * 배치 거리는 안개(150~950m)에 **일부러** 물린다. 680~900m 에 두면 자기 색의
 * 20% 만 남아 **뿌연 실루엣**으로 읽힌다 — 선명한 산이 아니라 안개 속 형체다.
 * 그래서 저폴리 덩어리로 충분하고, 전부 합쳐 2 드로우콜이다.
 */

/** 안개에 반쯤 먹혀야 하는 거리대. 이보다 가까우면 저폴리 티가 나고, 멀면 안 보인다. */
const RIDGE_MIN = 660;
const RIDGE_MAX = 900;

/**
 * 언덕 하나 — 눌린 저폴리 덩어리. 능선은 이걸 겹쳐서 만든다.
 *
 * ⚠️ 1차 시도는 아래 반구를 `max(0, y)` 로 **눌러 평평한 원판**으로 만들었다.
 * 원판의 정점이 돔과 공유되면서 `computeVertexNormals` 가 옆·아래를 향하는 법선을
 * 뱉었고, 반경 150~350m 짜리 **빛 안 받는 검은 디스크** 66장이 지평선을 가로지르는
 * 검은 띠가 됐다(실측). **교훈: 정점을 한 평면으로 눌러 붙이면 법선이 깨진다.**
 * 자르지 말고 **묻는다** — 아래 절반은 지형·스커트가 가린다.
 */
function hillGeometry(salt: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // 마루를 옆으로 늘이고 사면을 흐트러뜨린다 — 대칭이면 "공"으로 읽힌다
    const k = 1 + Math.sin(x * 3.1 + salt) * 0.22 + Math.cos(z * 2.7 + salt * 1.7) * 0.18;
    pos.setXYZ(i, x * k * 1.7, y * 0.62, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildDistantRidges(scene: THREE.Scene, registry: ThermalRegistry): void {
  const geometries = [0, 1, 2].map((i) => hillGeometry(i * 4.7));
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });

  // 능선은 **겹쳐야** 능선이다 — 방위각을 촘촘히 돌면서 거리를 흔든다.
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const PER = 22;
  for (let vi = 0; vi < 3; vi++) {
    const mesh = new THREE.InstancedMesh(geometries[vi], material, PER);
    for (let i = 0; i < PER; i++) {
      const a = ((i + vi / 3) / PER) * Math.PI * 2 + rnd(-0.06, 0.06);
      const r = rnd(RIDGE_MIN, RIDGE_MAX);
      const w = rnd(90, 210);
      const h = rnd(34, 88);
      // 절반 넘게 묻는다 — 마루만 안개 위로 올라오게. 밑동은 지평선 스커트가 가린다.
      dummy.position.set(Math.cos(a) * r, -h * 0.58, Math.sin(a) * r);
      dummy.rotation.set(0, rnd(0, 6.28), 0);
      dummy.scale.set(w, h, w * rnd(0.6, 1.0));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // 먼 것일수록 대기에 씻긴다 — 안개색 쪽으로 당겨 둔 청회색
      const far = (r - RIDGE_MIN) / (RIDGE_MAX - RIDGE_MIN);
      const v = 0.42 + far * 0.16 + rnd(-0.03, 0.03);
      col.setRGB(v * 0.92, v * 0.95, v * 0.88);
      mesh.setColorAt(i, col);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
    // 열화상에서 먼 지형은 하늘처럼 차갑다 — 튀면 안 된다
    registry.register(mesh, 0.1);
  }
}

/**
 * 원경 수목림 — 능선 앞에 **끊어져 선** 숲 덩어리.
 *
 * ⚠️ 1차 시도는 방위각을 균등히 돌며 연속된 링을 세웠다가 **지평선을 가로지르는
 * 검은 벽**을 만들었다(실측). 교훈 둘:
 * 1. **연속된 링은 어떤 거리에서도 벽으로 읽힌다.** 각도에 구멍을 내야 한다 —
 *    트인 들판이 있어야 숲도 숲으로 보인다.
 * 2. 원경 색은 **생각보다 훨씬 밝아야** 한다. 안개가 40%만 섞이는 거리에서
 *    자기 색 0.2 는 검정이 된다. 대기에 씻긴 값(0.34~0.44)에서 시작한다.
 */
export function buildFarTreeline(scene: THREE.Scene, registry: ThermalRegistry): void {
  const geometry = new THREE.CylinderGeometry(1, 1.15, 1, 5, 1, true);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  const N = 130;
  const mesh = new THREE.InstancedMesh(geometry, material, N);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N * 2 && n < N; i++) {
    const a = (i / (N * 2)) * Math.PI * 2 + rnd(-0.03, 0.03);
    // 방위각 게이트 — 노이즈로 숲과 트인 들을 가른다. 링이 되지 않게 하는 장치.
    const openness = fbm(Math.cos(a) * 2.2 + 40, Math.sin(a) * 2.2 + 40, 2);
    if (openness < 0.46) continue; // 여기는 트인 들판
    const r = rnd(520, 760); // 작전 구역(490) 밖. 거리도 흩어 한 줄로 안 보이게.
    const w = rnd(22, 54);
    const h = rnd(8, 16);
    dummy.position.set(Math.cos(a) * r, h * 0.42 - 3, Math.sin(a) * r);
    dummy.rotation.set(0, rnd(0, 6.28), 0);
    dummy.scale.set(w, h, w * 0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    const v = 0.34 + random() * 0.1;
    col.setRGB(v * 0.95, v * 1.0, v * 0.85); // 대기에 씻긴 회록
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  scene.add(mesh);
  registry.register(mesh, 0.16);
}
