import type { MissionDef } from '@/data/missions';
import type { CrashReason } from '@/drone/FlightModel';
import type { DebriefData, ThreatCauseDetail } from '@/core/GameState';

/**
 * 미션 러너 — T8c. 목표/실패 판정과 디브리핑 재료 조립.
 *
 * **실패가 가르친다** (GDD 4.5 규칙 4): 격추 시 원인 1줄이 자동으로 나와야
 * "다음엔 된다"는 확신이 생긴다. 문장 조립은 여기서 하지 않는다 — 키와 수치만
 * 확정하고, 화면(Debrief)이 로케일에 맞게 조립한다.
 * 결과 타입(`DebriefData`)은 화면 간 공유 상태라 `core/GameState` 에 있다.
 */

export type { DebriefData, ThreatCauseDetail };

/** CrashReason → i18n 키. 여기 없는 사유가 생기면 컴파일이 아니라 테스트가 잡는다. */
const CAUSE_KEY: Record<CrashReason, string> = {
  '지면 충돌': 'cause.ground',
  '구조물 충돌': 'cause.structure',
  '배터리 소진': 'cause.battery',
  피격: 'cause.strike', // 위협 상세가 있으면 그쪽이 우선 — 이 키는 폴백
  '자폭 돌입': 'cause.strike',
  '작전 구역 이탈': 'cause.ao',
};

export class MissionRunner {
  private kills = 0;
  private threatDetail: ThreatCauseDetail | null = null;
  private result: DebriefData | null = null;

  constructor(readonly def: MissionDef) {}

  onStrike(): void {
    this.kills++;
  }

  /** 피격 상세 — crash('피격') 직전에 들어온다 */
  onThreatHit(detail: ThreatCauseDetail): void {
    this.threatDetail = detail;
  }

  /**
   * 출격 종료. 자폭 드론이라 모든 출격은 기체 손실로 끝난다 —
   * 성공이란 "죽기 전에 목표를 채웠는가"다.
   */
  finish(reason: CrashReason, flightSec: number): DebriefData {
    this.result = {
      missionId: this.def.id,
      titleKey: this.def.titleKey,
      cleared: this.kills >= this.def.destroyGoal,
      kills: this.kills,
      goal: this.def.destroyGoal,
      flightSec: Math.round(flightSec),
      causeKey: CAUSE_KEY[reason],
      threat: reason === '피격' ? this.threatDetail : null,
    };
    return this.result;
  }

  get debrief(): DebriefData | null {
    return this.result;
  }

  /** 같은 미션 재출격 — 격파 수까지 처음부터다 */
  reset(): void {
    this.kills = 0;
    this.threatDetail = null;
    this.result = null;
  }
}
