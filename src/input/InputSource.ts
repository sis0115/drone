/**
 * 모든 입력은 이 인터페이스로 수렴한다. 가상 패드·키보드·Playwright 스크립트가
 * 같은 자리에 꽂히므로, 테스트가 사람과 동일한 경로로 비행할 수 있다 (02 문서 3.2).
 * 각 축의 범위는 -1..1 (throttle만 -1..1 = 하강..상승).
 */
export interface InputFrame {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  fire: boolean;
}

export const NEUTRAL: Readonly<InputFrame> = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
  fire: false,
});

export interface InputSource {
  readonly name: string;
  /** elapsed = 미션 시작 후 경과 초 */
  sample(elapsed: number, dt: number): InputFrame;
  dispose?(): void;
}

/** 중립 고정. T1 기본값. */
export class NullInputSource implements InputSource {
  readonly name = 'null';
  sample(): InputFrame {
    return { ...NEUTRAL };
  }
}

/** Playwright가 `window.__debug.setInput(fn)` 으로 꽂는 구현체. */
export class ScriptedInputSource implements InputSource {
  readonly name = 'scripted';
  constructor(private fn: (elapsed: number, dt: number) => Partial<InputFrame>) {}

  sample(elapsed: number, dt: number): InputFrame {
    return { ...NEUTRAL, ...this.fn(elapsed, dt) };
  }
}

export function clampAxis(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
