import type { StickMode } from '@/data/controls';
import { VirtualPad, type Axis2 } from './VirtualPad';
import { NEUTRAL, type InputFrame, type InputSource } from './InputSource';

/**
 * 양손 가상 스틱. 화면 좌/우 절반이 각각 한 스틱을 담당한다.
 *
 * 스틱 배치(Mode 1/2)는 여기서만 갈린다 — 비행 모델은 축 이름만 알면 된다.
 */
export class TouchInput implements InputSource {
  readonly name = 'touch';
  readonly left = new VirtualPad();
  readonly right = new VirtualPad();

  /** 패드 중심을 UI 가 알려 준다 (화면 크기에 따라 달라지므로). */
  centers: { left: Axis2; right: Axis2 } = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

  constructor(public stickMode: StickMode = 2) {}

  /** 화면 어느 쪽을 눌렀는지로 스틱을 고른다. */
  padFor(x: number, viewportWidth: number): VirtualPad {
    return x < viewportWidth * 0.5 ? this.left : this.right;
  }

  sample(): InputFrame {
    const l = this.left.value;
    const r = this.right.value;
    return this.stickMode === 2
      ? { ...NEUTRAL, throttle: -l.y, yaw: l.x, pitch: -r.y, roll: r.x }
      : // Mode 1 — RC 경력자 배치: 스로틀이 오른손으로 간다
        { ...NEUTRAL, pitch: -l.y, yaw: l.x, throttle: -r.y, roll: r.x };
  }

  get active(): boolean {
    return this.left.active || this.right.active;
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}
