import { Vector3 } from 'three';
import type { InputFrame } from '@/input/InputSource';
import type { Obstacle } from '@/world/Props';
import type { Wind } from './Wind';

/**
 * 비행 모델 인터페이스. 구현 2종(Arcade/Pro).
 * 프로토타입의 두 함수 분기를 그대로 옮기지 않고 여기서 가른다 (07 문서 3장).
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

export type CrashReason = '지면 충돌' | '구조물 충돌' | '배터리 소진' | '피격' | '자폭 돌입' | '작전 구역 이탈';

export interface FlightContext {
  heightAt(x: number, z: number): number;
  obstacles: readonly Obstacle[];
  wind: Wind;
  /** 격추. 사유는 디브리핑의 실패 원인 분석에 그대로 쓰인다 (GDD 4.5 규칙 4). */
  onCrash?(reason: CrashReason): void;
}

export interface FlightModel {
  readonly mode: 'arcade' | 'pro';
  reset(pos: Vector3, yaw: number): void;
  step(input: InputFrame, dt: number): void;
  readonly telemetry: DroneTelemetry;
  /** 급기동 화면 밀림 (후처리 uShake). 아케이드는 0. */
  readonly shake: { x: number; y: number };
  /** 고도 유지 목표 (아케이드만). 프로는 조종사가 직접 잡으므로 없다. */
  readonly targetAltitude?: number;
}

/** 두 구현이 공유하는 상태. */
export class FlightState implements DroneTelemetry {
  pos = new Vector3();
  vel = new Vector3();
  yaw = Math.PI;
  pitch = 0;
  roll = 0;
  agl = 0;

  get spd(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  reset(pos: Vector3, yaw: number): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
  }
}
