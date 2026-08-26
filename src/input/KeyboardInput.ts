import { type InputFrame, type InputSource, NEUTRAL } from './InputSource';

const MAP: Record<string, keyof InputFrame> = {
  KeyW: 'pitch',
  KeyS: 'pitch',
  KeyA: 'roll',
  KeyD: 'roll',
  ArrowLeft: 'yaw',
  ArrowRight: 'yaw',
  ArrowUp: 'throttle',
  ArrowDown: 'throttle',
};

const SIGN: Record<string, number> = {
  KeyW: 1, KeyS: -1, KeyD: 1, KeyA: -1,
  ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1,
};

export class KeyboardInput implements InputSource {
  readonly name = 'keyboard';
  private readonly down = new Set<string>();

  constructor(private readonly target: EventTarget = window) {
    this.target.addEventListener('keydown', this.onDown as EventListener);
    this.target.addEventListener('keyup', this.onUp as EventListener);
  }

  /** 축이 아닌 단발 키(모드 전환 등)를 받는다. */
  onAction: ((code: string) => void) | null = null;

  private readonly onDown = (e: KeyboardEvent) => {
    if (MAP[e.code] || e.code === 'Space') {
      this.down.add(e.code);
      e.preventDefault();
      return;
    }
    if (!e.repeat) this.onAction?.(e.code);
  };

  private readonly onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  sample(): InputFrame {
    const frame: InputFrame = { ...NEUTRAL };
    for (const code of this.down) {
      const axis = MAP[code];
      if (axis) (frame[axis] as number) = SIGN[code];
    }
    frame.fire = this.down.has('Space');
    return frame;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown as EventListener);
    this.target.removeEventListener('keyup', this.onUp as EventListener);
    this.down.clear();
  }
}
