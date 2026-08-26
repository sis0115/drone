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
  | 'flight'
  | 'debrief';
export type FlightMode = 'arcade' | 'pro';
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
