import * as THREE from 'three';
import { HEAT } from '@/data/thermal';

/**
 * 열화상은 셰이더 밝기 리맵이 아니라 **머티리얼 스왑**이다 (07 문서 2.3).
 * 오브젝트를 만들 때 열값과 함께 등록해 두면, T6 의 모드 전환이
 * 이 목록만 훑어 머티리얼을 갈아끼운다.
 *
 * 등록을 씬 생성 시점에 해 두는 이유: 나중에 하려면 모든 오브젝트 생성부를
 * 다시 건드려야 한다.
 */
export interface ThermalPair {
  mesh: THREE.Mesh | THREE.InstancedMesh;
  normal: THREE.Material | THREE.Material[];
  thermal: THREE.Material;
}

export class ThermalRegistry {
  readonly pairs: ThermalPair[] = [];

  /** 열값(0=차가움 ~ 1=백열)과 함께 등록하고 메시를 그대로 돌려준다. */
  register<T extends THREE.Mesh | THREE.InstancedMesh>(mesh: T, heat: number): T {
    this.pairs.push({
      mesh,
      normal: mesh.material,
      thermal: new THREE.MeshBasicMaterial({
        color: new THREE.Color(heat, heat, heat),
        fog: true,
      }),
    });
    return mesh;
  }

  /** 02 문서 4.4 열값 테이블의 키로 등록한다. 숫자를 흩뿌리지 말 것. */
  registerAs<T extends THREE.Mesh | THREE.InstancedMesh>(mesh: T, key: keyof typeof HEAT): T {
    return this.register(mesh, HEAT[key]);
  }

  setThermal(on: boolean): void {
    for (const pair of this.pairs) {
      pair.mesh.material = on ? pair.thermal : pair.normal;
    }
  }

  dispose(): void {
    for (const pair of this.pairs) pair.thermal.dispose();
    this.pairs.length = 0;
  }
}
