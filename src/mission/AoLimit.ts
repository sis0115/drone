import { AO } from '@/data/mission';

/**
 * 작전 구역 감시 — T8b.
 *
 * 경계는 원이다: 중계기 커버리지는 방향이 없다. 판정은 수평 거리만 본다 —
 * 고도로는 커버리지를 벗어날 수 없다(수직 이탈은 배터리가 먼저 막는다).
 *
 * 이탈 중에는 `progress`(0→1)가 3초에 걸쳐 차오르고, FlightScreen 이 이 값을
 * 신호 감쇠에 얹는다 — 화면이 점점 무너지다 끊기는 것이 "경계에 부딪히는 것"보다
 * 이 게임의 문법(모든 것은 링크다)에 맞다.
 */
export interface AoState {
  /** 경계 밖인가 */
  outside: boolean;
  /** 이탈 진행 0~1. 1 = 링크 상실 확정 */
  progress: number;
  /** 남은 유예 (초, 올림). HUD 카운트다운용 */
  secondsLeft: number;
  /** 경계까지의 거리 (m). 밖이면 음수 */
  distanceToEdge: number;
  /** 경고를 띄워야 하는가 (경고 밴드 안 또는 이탈 중) */
  warning: boolean;
}

export class AoLimit {
  private elapsed = 0;

  constructor(private readonly radius = AO.radius_m) {}

  update(x: number, z: number, dt: number): AoState {
    const distanceToEdge = this.radius - Math.hypot(x, z);
    const outside = distanceToEdge < 0;

    if (outside) {
      this.elapsed += dt;
    } else {
      // 복귀하면 유예가 **전부** 돌아온다 — 부분 누적을 남기면 경계 근처 비행이
      // 보이지 않는 자원을 깎는 게임이 된다. 위협의 조준 리셋과 같은 논리다.
      this.elapsed = 0;
    }

    const progress = Math.min(1, this.elapsed / AO.grace_s);
    return {
      outside,
      progress,
      secondsLeft: Math.max(0, Math.ceil(AO.grace_s - this.elapsed)),
      distanceToEdge,
      warning: outside || distanceToEdge < AO.warn_band_m,
    };
  }

  get expired(): boolean {
    return this.elapsed >= AO.grace_s;
  }

  reset(): void {
    this.elapsed = 0;
  }
}
