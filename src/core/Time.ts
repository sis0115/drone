/** 프레임 시간과 fps를 한곳에서 관리한다. dt는 스파이크 방지를 위해 상한을 둔다. */
const MAX_DT = 1 / 20;

export class Time {
  dt = 0;
  /** 시뮬레이션 경과 — dt 가 상한(1/20s)에 걸리므로 실시간보다 느려질 수 있다. */
  elapsed = 0;
  /**
   * 벽시계 경과. UI 연출(부팅 게이지 등)은 **반드시 이쪽**을 써야 한다.
   * elapsed 를 쓰면 저사양 기기에서 0.6초 연출이 십수 초가 된다(실측).
   */
  wall = 0;
  frame = 0;
  /**
   * 실측 프레임레이트. **반드시 클램프 전의 raw dt 로 계산한다.**
   * 프로토타입은 클램프된 dt(상한 0.05s)를 누적해서, 실제 1.1fps 인 상황에서도
   * 20fps 라고 표시했다(실측). 저사양 진단이 불가능해지는 함정이다.
   */
  fps = 0;

  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  reset(now: number): void {
    this.last = now;
    this.dt = 0;
    this.elapsed = 0;
    this.wall = 0;
    this.frame = 0;
  }

  tick(now: number): number {
    if (this.last === 0) this.last = now;
    const raw = (now - this.last) / 1000;
    this.last = now;
    this.dt = Math.min(raw, MAX_DT);
    this.elapsed += this.dt;
    this.wall += raw;
    this.frame++;

    this.fpsAccum += raw;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      const measured = this.fpsFrames / this.fpsAccum;
      // 10 미만은 소수점 한 자리까지 — 0.8fps 를 "1" 로 뭉개면 진단이 안 된다.
      this.fps = measured < 10 ? Math.round(measured * 10) / 10 : Math.round(measured);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    return this.dt;
  }
}
