/** 프레임 시간과 fps를 한곳에서 관리한다. dt는 스파이크 방지를 위해 상한을 둔다. */
const MAX_DT = 1 / 20;

export class Time {
  dt = 0;
  elapsed = 0;
  frame = 0;
  fps = 0;

  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  reset(now: number): void {
    this.last = now;
    this.dt = 0;
    this.elapsed = 0;
    this.frame = 0;
  }

  tick(now: number): number {
    if (this.last === 0) this.last = now;
    const raw = (now - this.last) / 1000;
    this.last = now;
    this.dt = Math.min(raw, MAX_DT);
    this.elapsed += this.dt;
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
