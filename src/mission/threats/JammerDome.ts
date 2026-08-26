import type { Vector3 } from 'three';
import { B1_JAMMER as B1 } from '@/data/threats';
import { BaseThreat, horizontalDistance, type ThreatEffect, type ThreatSense } from './Threat';

/**
 * B1 재밍 돔 — GDD 4.5 B 계열.
 *
 * **죽이지 않는다. 화면을 뺏는다.** 이게 A 계열과의 차이고,
 * 그래서 `signalQuality` 단일 변수(07 문서 2.2)에 물린다 — 노이즈·프리즈·입력 지연이
 * 전부 그 하나에서 파생되므로 여기서 손댈 곳은 감쇠 계수 하나뿐이다.
 *
 * 경계는 부드럽다. 딱 끊기면 "고장"으로 읽히고, 서서히 무너져야 "재밍"으로 읽힌다.
 */
export class JammerDome extends BaseThreat {
  readonly id = 'B1' as const;
  /** 죽이지 않는다 — HUD 가 적색을 쓰지 않게 하는 근거 */
  readonly lethal = false;

  constructor(
    at: Vector3,
    private readonly radius = B1.radius_m,
    private readonly core = B1.core_m,
  ) {
    super(at);
  }

  update(sense: ThreatSense): ThreatEffect {
    const distance = horizontalDistance(sense.pos, this.at);

    if (distance > this.radius + B1.warn_band_m) {
      this.clearWarning();
      return { jam: 0, kill: null };
    }

    // 밖 → 0, 코어 → 1. 경계에서 미분이 0 이라 진입이 매끄럽다.
    const span = Math.max(1e-3, this.radius - this.core);
    const k = Math.max(0, Math.min(1, (this.radius - distance) / span));
    const jam = k * k * (3 - 2 * k);

    // 경계 밖 예고 밴드에서도 예고가 뜬다 — 들어가기 **전에** 알아야 우회가 성립한다
    this.warn('field', jam, distance, sense.dt);
    return { jam, kill: null };
  }
}
