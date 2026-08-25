import type { Vector3 } from 'three';
import type { InputFrame } from '@/input/InputSource';

/**
 * 비행 모델 인터페이스. 구현 2종(Arcade/Pro)은 T3에서 붙인다 (07 문서 3장).
 * 프로토타입의 두 함수 분기를 그대로 옮기지 말고 이 인터페이스로 가른다.
 */
export interface DroneTelemetry {
  pos: Vector3;
  vel: Vector3;
  /** 지면 대비 고도 (Above Ground Level, m) */
  agl: number;
  /** 수평 속력 (m/s) */
  spd: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FlightModel {
  readonly mode: 'arcade' | 'pro';
  reset(pos: Vector3, yaw: number): void;
  step(input: InputFrame, dt: number): void;
  readonly telemetry: DroneTelemetry;
}
