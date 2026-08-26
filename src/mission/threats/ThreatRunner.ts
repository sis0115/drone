import { TELEGRAPH_MIN_S } from '@/data/threats';
import type { Threat, ThreatId, ThreatKill, ThreatSense, Telegraph } from './Threat';

/**
 * 위협 러너 — **GDD 4.5 규칙 1을 코드로 강제하는 자리.**
 *
 * 위협은 격추를 *요청*할 뿐이고, 통과 여부는 여기가 정한다.
 * 계약: 격추 요청 시점에 그 위협의 예고가 최소 `TELEGRAPH_MIN_S` 동안 떠 있어야 한다.
 * 못 지킨 요청은 **폐기하고 `violations` 에 남긴다** — 조용히 넘기면
 * "가끔 예고 없이 죽는" 버그가 되고, 그건 재현이 안 돼 영원히 안 잡힌다.
 *
 * 위협을 새로 만드는 사람이 규칙을 읽지 않아도 규칙이 지켜지는 것이 목적이다.
 */

export interface ThreatWarning {
  id: ThreatId;
  kind: Telegraph['kind'];
  progress: number;
  distance: number;
  /** 이 예고가 떠 있은 시간(초). 계약 검사의 근거이자 테스트가 보는 값 */
  elapsed: number;
  /** 계약을 만족해 지금 격추가 가능한 상태인가 — HUD 가 색을 바꾼다 */
  armed: boolean;
}

export interface ThreatFrame {
  /** 모든 위협 중 최대 감쇠. 합산하지 않는다 — 돔 두 개가 겹쳐도 신호는 0 아래로 안 간다 */
  jam: number;
  /** 이번 프레임에 통과된 격추. 없으면 null */
  kill: ThreatKill | null;
  /** HUD 가 띄울 가장 급한 예고 하나 */
  warning: ThreatWarning | null;
  /** 화면 마커용 — 예고 중인 위협 전부 */
  warnings: ThreatWarning[];
}

const EMPTY: ThreatFrame = { jam: 0, kill: null, warning: null, warnings: [] };

/** 급한 순서: 계약 성립 > 예고 종류 > 진행도. HUD 는 한 줄뿐이라 하나를 골라야 한다. */
function urgency(w: ThreatWarning): number {
  const kind = w.kind === 'aim' ? 2 : w.kind === 'field' ? 1 : 0;
  return (w.armed ? 100 : 0) + kind * 10 + w.progress;
}

export class ThreatRunner {
  /** 계약 위반 기록. 테스트가 비어 있음을 강제한다 */
  readonly violations: string[] = [];

  constructor(readonly threats: readonly Threat[] = []) {}

  update(sense: ThreatSense): ThreatFrame {
    if (!this.threats.length) return EMPTY;

    let jam = 0;
    let kill: ThreatKill | null = null;
    const warnings: ThreatWarning[] = [];

    for (const threat of this.threats) {
      const effect = threat.update(sense);
      if (effect.jam > jam) jam = effect.jam;

      // ── 계약 검사 ──
      // 격추를 올리는 그 프레임에 예고가 살아 있어야 한다. 발사 직전에 예고를 지우는
      // 위협은 여기서 걸린다 — 플레이어 화면에서 "예고가 사라지자마자 죽는" 것과 같기 때문이다.
      if (effect.kill) {
        const tel = threat.telegraph;
        if (tel && tel.elapsed >= TELEGRAPH_MIN_S) {
          kill ??= effect.kill;
        } else {
          this.violations.push(
            `${threat.id}: 예고 ${tel ? tel.elapsed.toFixed(2) : '없음'}초로 격추 요청 ` +
              `(최소 ${TELEGRAPH_MIN_S}초). 폐기함`,
          );
        }
      }

      const tel = threat.telegraph;
      if (tel) {
        warnings.push({
          id: threat.id,
          kind: tel.kind,
          progress: tel.progress,
          distance: tel.distance,
          elapsed: tel.elapsed,
          armed: tel.elapsed >= TELEGRAPH_MIN_S,
        });
      }
    }

    let warning: ThreatWarning | null = null;
    for (const w of warnings) if (!warning || urgency(w) > urgency(warning)) warning = w;

    return { jam, kill, warning, warnings };
  }

  reset(): void {
    for (const threat of this.threats) threat.reset();
    this.violations.length = 0;
  }
}
