import * as THREE from 'three';
import type { ThermalRegistry } from '@/render/ThermalRegistry';

/**
 * 반복 오브젝트는 **반드시** InstancedMesh 로 만든다.
 * 개별 Mesh 로 만들면 드로우콜이 116 → 1,940 으로 폭증한다(실측, 02 문서 5장).
 */

export interface InstanceSpec {
  /** 위치 [x, y, z] */
  p: [number, number, number];
  /** 오일러 회전 [x, y, z] */
  r: [number, number, number];
  /** 스케일 [x, y, z] */
  s: [number, number, number];
  /** 개체별 색 (setColorAt). 생략하면 머티리얼 색 그대로. */
  c?: number;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function buildInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  list: InstanceSpec[],
  options: { heat: number; shadow?: boolean; registry: ThermalRegistry; scene: THREE.Scene },
): THREE.InstancedMesh | null {
  if (!list.length) return null;

  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    _dummy.position.set(o.p[0], o.p[1], o.p[2]);
    _dummy.rotation.set(o.r[0], o.r[1], o.r[2]);
    _dummy.scale.set(o.s[0], o.s[1], o.s[2]);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    if (o.c !== undefined) {
      _color.setHex(o.c);
      mesh.setColorAt(i, _color);
    }
  }

  const shadow = options.shadow !== false;
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  options.scene.add(mesh);
  options.registry.register(mesh, options.heat);
  return mesh;
}
