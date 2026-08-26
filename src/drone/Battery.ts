/**
 * 배터리 — GDD 4장 4대 제약 중 하나.
 * 기본 체공 180초. 기동 강도에 비례해 더 빨리 닳는다.
 */
const FULL_SECONDS = 180;

export class Battery {
  /** 잔량 0~100 (%) */
  level = 100;

  reset(): void {
    this.level = 100;
  }

  /** `load` 는 기동 강도 0~1 (아케이드는 전후진량, 프로는 추력 비율). */
  drain(dt: number, load: number): void {
    if (this.level <= 0) return;
    this.level -= (100 / FULL_SECONDS) * dt * (1 + load);
    if (this.level < 0) this.level = 0;
  }

  get empty(): boolean {
    return this.level <= 0;
  }

  /** 30% 이하는 저전압 경고 구간 (GDD 4장). */
  get low(): boolean {
    return this.level <= 30;
  }
}
