import { Ray, Vector3, type Box3 } from 'three';

/**
 * 차폐물의 최소 형태. `world/Props` 의 `Obstacle` 이 구조적으로 이걸 만족하므로
 * **core 가 world 를 import 하지 않고도** 같은 객체를 받을 수 있다
 * (계층 방향은 `tests/architecture.spec.ts` 가 강제한다).
 */
export interface Occluder {
  box: Box3;
}

/**
 * 가시선 차폐 판정 — 조종소와 기체 사이를 건물이 막는가.
 *
 * 신호 품질의 3대 입력 중 하나다(거리·LOS·재밍). 건물 뒤로 들어가면
 * 화면이 무너지는 그 연출의 실체이며, **레이캐스트가 아니라 AABB 교차**로 싸게 판정한다.
 * 결과는 평활화한다 — 경계에서 화면이 깜빡이지 않게.
 */
export class LineOfSight {
  /** 0 = 트임 / 1 = 완전 차폐. 평활화된 값. */
  blocked = 0;

  private readonly ray = new Ray();
  private readonly dir = new Vector3();
  private readonly origin = new Vector3();

  /** 조종소 위치. 기본은 착륙 패드 근처. */
  constructor(private readonly home = new Vector3(0, 1.5, 0)) {}

  update(dronePos: Vector3, obstacles: readonly Occluder[]): void {
    this.origin.copy(dronePos);
    this.dir.subVectors(this.home, this.origin);
    const dist = this.dir.length();
    this.dir.normalize();
    this.ray.set(this.origin, this.dir);

    let hit = 0;
    for (const o of obstacles) {
      // 기체 뒤쪽의 건물은 세지 않는다 — far 를 거리로 제한하는 효과.
      const t = this.ray.intersectBox(o.box, _tmp);
      if (t && this.origin.distanceTo(t) <= dist) {
        hit = 1;
        break;
      }
    }
    this.blocked += (hit - this.blocked) * 0.16;
  }

  reset(): void {
    this.blocked = 0;
  }
}

const _tmp = new Vector3();
