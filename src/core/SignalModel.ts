import { SIGNAL } from '@/data/render';

/**
 * 신호 품질 단일 변수.
 *
 * 프로토타입은 이 계산을 게임 루프 안에 인라인해 두었다. 그대로 옮기면
 * v0.5 의 EW 시스템(위협 카탈로그 B계열: 재밍 돔·스푸핑·역추적)이
 * **조작할 지점이 없어진다** — 07 문서 2.2 를 참조.
 *
 * 그래서 입력(거리·차폐·재밍)과 출력(`quality`)을 인터페이스로 가른다.
 * 계산식 자체는 프로토타입 그대로다.
 */
export interface SignalInputs {
  /** 조종소(원점)로부터의 수평 거리 (m) */
  distance: number;
  /** 가시선 차폐 정도 0~1 */
  losBlocked: number;
  /** 재밍 소스가 걸려 있는가 */
  jammed: boolean;
  /** 거리 감쇠 배율 (튜닝 파라미터 falloff) */
  falloff: number;
}

export class SignalModel {
  /** 평활화된 신호 품질 0.05~1. 후처리가 읽는 값. */
  quality = 1;
  /** 발작적 붕괴 강도 0~1. 상시 균일 노이즈가 아니라 리듬을 만든다. */
  burst = 0;
  /** 프레임 프리즈 중인가. 이 프레임에는 rtPrev 를 갱신하지 않는다(07 문서 2.1). */
  frozen = false;

  private raw = 1;
  private burstTimer = 0;
  private freezeHold = 0;
  private freezeTimer = 0;

  /** 계산식은 프로토타입 v0.7 그대로. 상수는 `src/data/render.ts` 의 SIGNAL. */
  update(inputs: SignalInputs, dt: number, freezeAmt: number): void {
    const { distance, losBlocked, jammed, falloff } = inputs;

    let sig = 1 - Math.max(0, distance - SIGNAL.falloffStart_m) / (900 / Math.max(0.2, falloff));
    sig += losBlocked * SIGNAL.losBlocked;
    if (jammed) sig += SIGNAL.jammed;
    this.raw = Math.max(0.05, Math.min(1, sig));

    // 급변을 막아 화면이 튀지 않게 한다.
    this.quality += (this.raw - this.quality) * Math.min(1, dt * 6);

    this.updateBurst(dt);
    this.updateFreeze(dt, freezeAmt);
  }

  /**
   * 붕괴 리듬 — 평온 → 발작적 붕괴 → 회복.
   * 상시 균일 노이즈보다 이쪽이 훨씬 "실제 링크" 같다 (07 문서 1장).
   */
  private updateBurst(dt: number): void {
    this.burstTimer -= dt;
    if (this.burstTimer <= 0) {
      const p = 0.25 + (1 - this.quality) * 0.9; // 신호 나쁠수록 자주
      if (Math.random() < p) {
        this.burst = 0.5 + Math.random() * 0.5;
        this.burstTimer = 0.5 + Math.random() * 1.1;
      } else {
        // **긴 평온 구간이 리듬의 핵심이다.** 여기를 짧게 잡으면
        // 상시 노이즈가 되어 "가끔 무너지는 링크"라는 인상이 사라진다.
        this.burstTimer = 2.0 + Math.random() * 3.5;
      }
    }
    this.burst = Math.max(0, this.burst - dt * (1.1 + this.quality * 1.4));
  }

  /** 프레임 프리즈 — 붕괴 중 확률적으로 화면이 멈춘다. */
  private updateFreeze(dt: number, freezeAmt: number): void {
    if (this.freezeHold > 0) {
      this.freezeHold -= dt;
    } else {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.freezeTimer = 0.15 + Math.random() * 0.55;
        const chance = (this.burst * 0.5 + (1 - this.quality) * 0.5) * freezeAmt;
        if (Math.random() < chance) this.freezeHold = 0.08 + Math.random() * 0.34;
      }
    }
    this.frozen = this.freezeHold > 0;
  }

  reset(): void {
    this.quality = 1;
    this.raw = 1;
    this.burst = 0;
    this.burstTimer = 0;
    this.freezeHold = 0;
    this.freezeTimer = 0;
    this.frozen = false;
  }
}
