import { rnd } from '@/world/noise';

/**
 * 바람 — GDD 4장의 4대 제약 중 하나.
 * 상시 정상풍 + 간헐적 돌풍. 돌풍은 무전으로 예고된다
 * (GDD 4.5 설계 규칙 1: 모든 위협은 예고된다).
 */
export class Wind {
  x = 0;
  z = 0;
  gust = 0;

  private gustTimer = 0;
  private onGust: ((strength: number) => void) | null = null;

  constructor(onGust?: (strength: number) => void) {
    this.onGust = onGust ?? null;
    this.reset();
  }

  reset(): void {
    this.x = rnd(-1.2, 1.2);
    this.z = rnd(-1.2, 1.2);
    this.gust = 0;
    this.gustTimer = rnd(6, 12);
  }

  /** 테스트·재현을 위해 바람을 완전히 끈다. */
  calm(): void {
    this.x = 0;
    this.z = 0;
    this.gust = 0;
    this.gustTimer = Number.POSITIVE_INFINITY;
  }

  update(dt: number): void {
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gust = rnd(3, 7);
      this.gustTimer = rnd(9, 17);
      this.onGust?.(this.gust);
    }
    this.gust = Math.max(0, this.gust - dt * 2.2);
  }

  /** 기체에 실제로 걸리는 가속도 성분. 돌풍은 축마다 계수가 다르다. */
  accelX(): number {
    return (this.x + this.gust * 0.6) * 0.35;
  }

  accelZ(): number {
    return (this.z + this.gust * 0.4) * 0.35;
  }
}
