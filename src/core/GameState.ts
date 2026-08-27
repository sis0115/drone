import type { PlayerProfile } from './Save';

/**
 * 화면 흐름 — GDD 2장 / 04 문서 2장.
 * 현재 구현: link, flight. 나머지는 T8(미션) · T9(경제)에서 붙는다.
 */
export type ScreenName =
  | 'link'
  | 'title'
  | 'ops'
  | 'briefing'
  | 'loadout'
  | 'hangar'
  | 'flight'
  | 'debrief'
  | 'outro';
export type FlightMode = 'arcade' | 'pro';

/**
 * 출격 결과 — 디브리핑 재료. **문장이 아니라 키와 수치다** (4개국어 대비).
 * `core` 에 있는 이유: 화면 간 공유 상태(GameState)의 일부인데, core 가
 * mission 을 부르면 계층이 역전된다. 조립(MissionRunner)은 mission/ 이 한다.
 */
export interface ThreatCauseDetail {
  causeKey: string;
  agl: number;
  adviceKey: string;
  adviceParams: readonly number[];
}

export interface DebriefData {
  missionId: string;
  titleKey: string;
  cleared: boolean;
  kills: number;
  goal: number;
  flightSec: number;
  /** 손실 원인 키 (`cause.*`). 위협 격추면 threat 상세가 우선한다 */
  causeKey: string;
  threat: ThreatCauseDetail | null;
  /** 이번 출격 SP 정산 (05 문서 4장). 지급은 디브리핑 확정 시점 */
  spEarned: number;
  /** 정산 내역 — 디브리핑이 한 줄씩 보여 준다. 합이 spEarned 다 */
  spBase: number;
  /** 고스트 확인(BDA) 보너스 — Ch.1 의 주제(확인 킬 학습)를 숫자로 보여 주는 자리 */
  spConfirm: number;
  /** 최초 완수 보너스 — 프롤로그의 약속을 회수한다. 재도전에는 0 */
  spFirstClear: number;
  /** 이번 완수가 이 미션의 **최초** 완수인가 — 데모 종료(아웃트로) 분기 */
  firstClear: boolean;
  /** 지급 후 잔액 — 디브리핑 화면이 카운트 표기에 쓴다 */
  spTotal: number;
}
export type CamMode = 'color' | 'thermal' | 'bw';

/**
 * 전역 런타임 상태. 저장 대상(PlayerProfile)과 런타임 전용 상태를 분리해 둔다 (05 문서 1장).
 */
export class GameState {
  screen: ScreenName = 'link';
  flightMode: FlightMode = 'arcade';
  camMode: CamMode = 'color';
  /** 거리·LOS·재밍이 수렴하는 단일 변수 (07 문서 2.2). 1 = 완전, 0 = 두절. */
  signalQuality = 1;
  paused = false;
  profile: PlayerProfile | null = null;
  /** 마지막 출격 결과 — FlightScreen 이 쓰고 DebriefScreen 이 읽는다. 화면 간 유일한 통로 */
  debrief: DebriefData | null = null;

  snapshot(): Record<string, unknown> {
    return {
      screen: this.screen,
      flightMode: this.flightMode,
      camMode: this.camMode,
      signalQuality: Number(this.signalQuality.toFixed(3)),
      paused: this.paused,
      sp: this.profile?.sp ?? 0,
    };
  }
}

export const state = new GameState();
