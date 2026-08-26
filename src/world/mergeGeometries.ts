import * as THREE from 'three';

/**
 * 여러 지오메트리를 **정점 컬러를 구운 하나**로 합친다.
 *
 * 트럭처럼 파트가 여러 개인 오브젝트를 개별 Mesh 로 만들면 드로우콜이 파트 수만큼 는다.
 * 색이 파트마다 다르면 인스턴싱도 못 쓰므로, 색을 정점에 굽고 지오메트리를 합쳐
 * **파트당 1콜**로 만든다 (02 문서 5장).
 */
export interface MergePart {
  geometry: THREE.BufferGeometry;
  /** 로컬 → 오브젝트 변환 */
  matrix: THREE.Matrix4;
  /** 이 파트의 색 [r, g, b] 0~1 */
  color: [number, number, number];
}

export function mergeParts(parts: MergePart[]): THREE.BufferGeometry {
  // 인덱스가 있으면 풀어서 정점 단위로 색을 넣을 수 있게 한다.
  const prepped = parts.map((p) => ({
    geometry: p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone(),
    matrix: p.matrix,
    color: p.color,
  }));
  const total = prepped.reduce((n, p) => n + p.geometry.attributes.position.count, 0);

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let offset = 0;

  for (const part of prepped) {
    const pos = part.geometry.attributes.position;
    const nor = part.geometry.attributes.normal;
    normalMatrix.getNormalMatrix(part.matrix);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
      positions.set([v.x, v.y, v.z], (offset + i) * 3);
      v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      normals.set([v.x, v.y, v.z], (offset + i) * 3);
      colors.set(part.color, (offset + i) * 3);
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

/** 파트 배치용 축약 — 위치/회전/스케일로 행렬을 만든다. */
export function place(
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}
