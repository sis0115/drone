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
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    return this.dt;
  }
}
