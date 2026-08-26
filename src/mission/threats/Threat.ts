import type { Vector3 } from 'three';
import { TELEGRAPH_MIN_S } from '@/data/threats';

/**
 * 위협 프레임워크 — GDD 4.5.
 *
 * **왜 별도 계층인가**: 위협을 미션 코드 안에 흩어 두면 "모든 위협은 예고된다"는
 * 규칙이 위협마다 재구현된다. 재구현된 규칙은 반드시 하나가 빠진다.
 * 여기서는 예고를 **위협이 지키는 예의가 아니라 러너가 검사하는 계약**으로 만든다.
 *
 * `mission/` 은 렌더러도 월드도 부르지 않는다. 위협이 보는 것은 기체 상태뿐이고,
 * 내는 것은 감쇠·격추 요청뿐이다. 그래야 브라우저 없이 위협을 검증할 수 있다.
 */

export type ThreatId = 'A1' | 'B1';

/** 위협이 매 프레임 보는 것. 좌표 외에는 아무것도 모른다. */
export interface ThreatSense {
  pos: Readonly<Vector3>;
  /** 지면 대비 고도 (m) */
  agl: number;
  /** 속력 (m/s) */
  speed: number;
  dt: number;
}

/**
 * 예고의 종류.
 * - `watch` — 존재를 알린다. 아직 위험하지 않다
 * - `aim`   — 조준 중. 이 상태로 계약 시간이 지나야 격추가 성립한다
 * - `field` — 구역형(재밍 등). 진입 전부터 뜬다
 */
export type TelegraphKind = 'watch' | 'aim' | 'field';

export interface Telegraph {
  kind: TelegraphKind;
  /** 0~1. 1 이면 지금 터진다 */
  progress: number;
  /** 이 예고가 떠 있은 시간(초). 러너가 0.5초 계약을 이 값으로 검사한다 */
  elapsed: number;
  /** 위협까지의 수평 거리 (m) */
  distance: number;
}

/**
 * 격추 요청. 원인 분석(GDD 4.5 규칙 4)에 필요한 **재료**를 싣는다.
 *
 * 문장이 아니라 키와 숫자로 넘긴다 — 위협이 완성된 한국어를 들고 있으면
 * 4개국어(v1.0)에서 전역 수색이 된다. 문장 조립은 디브리핑(T8)의 일이다.
 */
export interface ThreatKill {
  threatId: ThreatId;
  /** 원인 문자열 키 (`src/i18n`) */
  causeKey: string;
  /** 피격 당시 고도 — "접근 고도 12m / 권장 40m 이상" 문구의 재료 */
  agl: number;
  /** 대응법 문자열 키 */
  adviceKey: string;
  /** 대응법 문장에 끼워 넣을 수치 (권장 고도 등) */
  adviceParams: readonly number[];
}

export interface ThreatEffect {
  /** 신호 감쇠 요청 0~1. 1 이면 완전 재밍 */
  jam: number;
  /** 이번 프레임 격추 요청. 러너가 계약을 검사한 뒤에만 통과한다 */
  kill: ThreatKill | null;
}

export interface Threat {
  readonly id: ThreatId;
  /**
   * 이 위협이 격추까지 가는가.
   * HUD 색이 여기서 갈린다 — B1 재밍은 예고가 계약을 만족해도(`armed`) 죽이지 않으므로
   * 적색으로 띄우면 안 된다. 적색을 남발하면 진짜 적색이 안 읽힌다.
   */
  readonly lethal: boolean;
  /** 월드 좌표. 오버레이가 화면에 찍는다 */
  readonly at: Vector3;
  readonly telegraph: Telegraph | null;
  update(sense: ThreatSense): ThreatEffect;
  reset(): void;
}

export const NO_EFFECT: ThreatEffect = { jam: 0, kill: null };

/**
 * 예고 시간 누적을 대신 해 주는 베이스.
 *
 * 위협 구현체가 `elapsed` 를 직접 세게 두면 반드시 어딘가에서 0 으로 리셋을 빠뜨린다.
 * 종류나 대상이 바뀌면 예고는 **새로 시작한 것**이므로 시계도 0 부터다.
 */
export abstract class BaseThreat implements Threat {
  abstract readonly id: ThreatId;
  abstract readonly lethal: boolean;
  telegraph: Telegraph | null = null;

  constructor(readonly at: Vector3) {}

  abstract update(sense: ThreatSense): ThreatEffect;

  /** 예고를 켜거나 갱신한다. 종류가 바뀌면 시계가 0 부터 다시 간다. */
  protected warn(kind: TelegraphKind, progress: number, distance: number, dt: number): void {
    if (!this.telegraph || this.telegraph.kind !== kind) {
      this.telegraph = { kind, progress, elapsed: 0, distance };
      return;
    }
    this.telegraph.progress = progress;
    this.telegraph.distance = distance;
    this.telegraph.elapsed += dt;
  }

  protected clearWarning(): void {
    this.telegraph = null;
  }

  /** 계약을 만족하는 예고가 떠 있는가. 러너도 같은 판정을 독립적으로 한 번 더 한다. */
  protected get armed(): boolean {
    return this.telegraph !== null && this.telegraph.elapsed >= TELEGRAPH_MIN_S;
  }

  reset(): void {
    this.telegraph = null;
  }
}

/** 수평 거리 — 위협 판정은 전부 수평이다. 고도는 별도 조건으로 본다. */
export function horizontalDistance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
