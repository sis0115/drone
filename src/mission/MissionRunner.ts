import type { MissionDef } from '@/data/missions';
import { CONFIRM_MULTIPLIER, FIRST_CLEAR_BONUS, SP_VALUE, TIER_MULTIPLIER } from '@/data/economy';
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
   *
   * `alreadyCleared` 는 **호출자(프로필을 아는 쪽)** 가 알려 준다 — 러너가 세이브를
   * 직접 읽으면 미션 로직이 저장 스키마에 묶인다. 최초 완수에만 보너스가 붙는다.
   */
  finish(reason: CrashReason, flightSec: number, alreadyCleared = false): DebriefData {
    const cleared = this.kills >= this.def.destroyGoal;
    const firstClear = cleared && !alreadyCleared;
    // SP 정산 (05 문서 4.1/4.3.2): 격파 × 표적 가치 × 차수 배율.
    const spBase = Math.round(this.kills * SP_VALUE.truck * TIER_MULTIPLIER[0]);
    // 확인(BDA) — Ch.1 은 고스트가 자동 확인한다(03 문서 1막 "확인 킬 시스템 학습").
    const spConfirm = Math.round(spBase * (CONFIRM_MULTIPLIER - 1));
    // 첫 실적 보너스 — 프롤로그의 약속을 회수한다. 반복 파밍으로는 안 나온다.
    const spFirstClear = firstClear ? FIRST_CLEAR_BONUS : 0;
    this.result = {
      missionId: this.def.id,
      titleKey: this.def.titleKey,
      cleared,
      firstClear,
      kills: this.kills,
      goal: this.def.destroyGoal,
      flightSec: Math.round(flightSec),
      causeKey: CAUSE_KEY[reason],
      threat: reason === '피격' ? this.threatDetail : null,
      spBase,
      spConfirm,
      spFirstClear,
      spEarned: spBase + spConfirm + spFirstClear,
      spTotal: 0, // 지급 주체(FlightScreen)가 프로필 반영 후 채운다
    };
    return this.result;
  }

  /** HUD 목표 표기용 */
  get killCount(): number {
    return this.kills;
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
