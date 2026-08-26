import { HIT_RADIUS } from '@/data/flight';

/**
 * 자폭 돌입 판정 — T8a.
 *
 * **무장이 아니라 기체가 탄이다.** GDD 4장 시그니처("격추·자폭 순간 SIGNAL LOST")와
 * 4.7("1기 자폭 = 미션 종료")이 전제하는 FPV 자폭 드론 — 조준·발사가 아니라
 * **돌입이 공격**이다. `input.fire` 는 M6 투하 미션용으로 남겨 둔다.
 *
 * 판정 수식은 프로토타입 v0.7 `hitTargets()` 그대로:
 * 표적 기준점(바닥 + 2m)과의 3D 거리 < HIT_RADIUS. 반경이 어시스트별로 다른 것
 * (아케이드 7.0 / 프로 4.2)이 이 시스템의 튜닝 전부다 — 어시스트를 끄면 더 정확히 박아야 한다.
 */

/** 프로토타입 `hitTargets()` 의 `py - 2` — 트럭 차체 중심 높이. */
export const TARGET_CENTER_Y = 2;

/** 판정에 필요한 최소 형태 — `world/Targets` 를 직접 알지 않는다(교차 결합 최소화). */
export interface StrikeTarget {
  alive: boolean;
  group: { position: { x: number; y: number; z: number } };
}

export interface StrikeResult<T> {
  target: T;
  /** 기폭 시점 거리 (m) — 디브리핑 재료 */
  distance: number;
}

/**
 * 이번 프레임에 기폭이 성립하는 표적을 찾는다. 없으면 null.
 * 반경 안에 여럿이면 **가장 가까운 것** — 기체는 하나고 폭발도 한 번이다.
 */
export function findImpact<T extends StrikeTarget>(
  pos: { x: number; y: number; z: number },
  targets: readonly T[],
  mode: keyof typeof HIT_RADIUS,
): StrikeResult<T> | null {
  const radius = HIT_RADIUS[mode];
  let best: StrikeResult<T> | null = null;
  for (const target of targets) {
    if (!target.alive) continue;
    const p = target.group.position;
    const dx = pos.x - p.x;
    const dy = pos.y - (p.y + TARGET_CENTER_Y);
    const dz = pos.z - p.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < radius && (!best || d < best.distance)) best = { target, distance: d };
  }
  return best;
}
