import type { Vector3 } from 'three';
import { A1_SHOTGUN as A1 } from '@/data/threats';
import { BaseThreat, horizontalDistance, NO_EFFECT, type ThreatEffect, type ThreatSense } from './Threat';

/**
 * A1 산탄총 보병 — GDD 4.5 A 계열.
 *
 * 예고: 총구를 드는 0.9초. 대응은 **세 갈래**이고, 셋 다 장비 없이 된다(규칙 2):
 *   ① 우회   — 위험 반경 50m 밖으로
 *   ② 상승   — 30m 위는 산탄이 안 닿는다
 *   ③ 급강하 — 6m 아래로 붙으면 덤불·지형에 사선이 끊긴다
 *
 * ③ 은 공짜가 아니다. 저공은 C1 전선줄과 지면 충돌의 영역이다. 그게 거래다.
 */
export class ShotgunInfantry extends BaseThreat {
  readonly id = 'A1' as const;
  readonly lethal = true;

  private aim = 0;
  private reload = 0;

  constructor(at: Vector3) {
    super(at);
  }

  update(sense: ThreatSense): ThreatEffect {
    const { dt, agl } = sense;
    const distance = horizontalDistance(sense.pos, this.at);

    if (this.reload > 0) {
      this.reload -= dt;
      // 재장전 중에도 존재는 보인다 — 사라졌다고 착각하면 다시 들어온다
      if (distance <= A1.detect_m) this.warn('watch', 0, distance, dt);
      else this.clearWarning();
      return NO_EFFECT;
    }

    // 사선이 성립하는가 — 반경 안 · 천장 아래 · 엄폐 위
    const inRange = distance <= A1.danger_m;
    const exposed = agl > A1.cover_agl_m && agl <= A1.ceiling_agl_m;

    if (!inRange || !exposed) {
      // 조준이 끊긴다. **부분 진행을 남기지 않는다** —
      // 남기면 여러 번 스쳐 지나가는 것만으로 예고 없이 죽는다.
      this.aim = 0;
      if (distance <= A1.detect_m) this.warn('watch', 0, distance, dt);
      else this.clearWarning();
      return NO_EFFECT;
    }

    this.aim = Math.min(A1.aim_s, this.aim + dt);
    this.warn('aim', this.aim / A1.aim_s, distance, dt);

    if (this.aim < A1.aim_s || !this.armed) return NO_EFFECT;

    this.aim = 0;
    this.reload = A1.reload_s;
    // 예고는 **이 프레임까지 켜 둔 채로** 격추를 올린다. 발사 직전에 지우면
    // 러너의 계약 검사가 "예고 없음"으로 읽어 요청을 폐기한다. 총성은 조준의 끝이지
    // 조준의 취소가 아니다. 다음 프레임 재장전 분기에서 watch 로 내려간다.
    return {
      jam: 0,
      kill: {
        threatId: this.id,
        causeKey: 'threat.a1.name',
        agl,
        adviceKey: 'threat.a1.advice',
        adviceParams: [A1.ceiling_agl_m, A1.cover_agl_m],
      },
    };
  }

  override reset(): void {
    super.reset();
    this.aim = 0;
    this.reload = 0;
  }

  /** 테스트·디버그용 — 조준 진행 0~1 */
  get aimProgress(): number {
    return this.aim / A1.aim_s;
  }
}
