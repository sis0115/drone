import * as THREE from 'three';
import { aoTex } from './textures';
import { terrainH } from './Terrain';
import { rnd } from './noise';
import type { InstanceSpec } from './Instancing';
import type { ThermalRegistry } from '@/render/ThermalRegistry';

/**
 * 접지 그늘(AO 패치). 나무·건물이 각자 요청을 쌓아 두고,
 * **씬 조립 마지막에 한 번에** 인스턴스 1콜로 굽는다.
 */
export class AoCollector {
  readonly patches: InstanceSpec[] = [];

  add(x: number, z: number, r: number): void {
    this.patches.push({
      p: [x, terrainH(x, z) + 0.12, z],
      r: [-Math.PI / 2, 0, rnd(0, 3)],
      s: [r, r, 1],
    });
  }

  build(scene: THREE.Scene, registry: ThermalRegistry): THREE.InstancedMesh | null {
    if (!this.patches.length) return null;

    const tex = aoTex();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      fog: true,
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), mat, this.patches.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.patches.length; i++) {
      const o = this.patches[i];
      dummy.position.set(o.p[0], o.p[1], o.p[2]);
      dummy.rotation.set(o.r[0], o.r[1], o.r[2]);
      dummy.scale.set(o.s[0], o.s[1], o.s[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.renderOrder = 1;
    scene.add(mesh);

    registry.pairs.push({
      mesh,
      normal: mat,
      thermal: new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
        fog: true,
      }),
    });
    return mesh;
  }
}
