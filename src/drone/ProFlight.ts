import { Vector3 } from 'three';
import { PRO } from '@/data/flight';
import type { InputFrame } from '@/input/InputSource';
import { FlightState, type FlightContext, type FlightModel } from './FlightModel';

/**
 * 프로 — 실물리, 기울기 기반.
 *
 * 기체를 기울여 추력 벡터를 눕히는 진짜 쿼드콥터 모델이다. 관성이 남고,
 * 멈추려면 반대로 기울여야 한다. 어시스트는 **수직 속도 유지(VS_KP)** 하나뿐이다.
 *
 * 실측 재현 대상 (02 문서 4.1): 호버 10초 드리프트 0.0000m, 최고속도 73.8km/h
 */
export class ProFlight implements FlightModel {
  readonly mode = 'pro' as const;
  readonly telemetry = new FlightState();
  /** 급기동량 → 화면 밀림. 후처리 uShake 로 들어간다. */
  readonly shake = { x: 0, y: 0 };

  constructor(private readonly ctx: FlightContext) {}

  reset(pos: Vector3, yaw: number): void {
    this.telemetry.reset(pos, yaw);
    this.shake.x = 0;
    this.shake.y = 0;
  }

  step(input: InputFrame, dt: number): void {
    const s = this.telemetry;

    const k = Math.min(1, PRO.TILT_RESP * dt);
    const prevPitch = s.pitch;
    const prevRoll = s.roll;
    s.pitch += (input.pitch * PRO.MAX_TILT - s.pitch) * k;
    s.roll += (input.roll * PRO.MAX_TILT - s.roll) * k;
    s.yaw += input.yaw * PRO.YAW_RATE * dt;

    // 기울기 변화량이 곧 화면 밀림 — 급기동할수록 카메라가 밀린다.
    this.shake.x += ((s.roll - prevRoll) * 2.2 - this.shake.x) * Math.min(1, dt * 9);
    this.shake.y += ((s.pitch - prevPitch) * 2.0 - this.shake.y) * Math.min(1, dt * 9);

    // 기체 상방 벡터 (기울기 → 월드)
    const cp = Math.cos(s.pitch);
    const sp = Math.sin(s.pitch);
    const cr = Math.cos(s.roll);
    const sr = Math.sin(s.roll);
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    const local = [sr * cp, cr * cp, -sp * cr];
    const up = [local[0] * cy + local[2] * sy, local[1], -local[0] * sy + local[2] * cy];

    // 수직 속도 어시스트: 목표 상승률에 맞춰 추력을 낸다.
    // up[1] 하한 0.35 — 90° 가까이 누우면 추력이 발산한다.
    const acc = (input.throttle * PRO.MAX_VS - s.vel.y) * PRO.VS_KP;
    const thrust = Math.max(
      0,
      Math.min(PRO.MAX_THRUST, (PRO.MASS * (PRO.G + acc)) / Math.max(0.35, up[1])),
    );

    const wind = this.ctx.wind;
    s.vel.x += ((up[0] * thrust) / PRO.MASS - s.vel.x * PRO.DRAG_H + wind.accelX()) * dt;
    s.vel.y += ((up[1] * thrust) / PRO.MASS - PRO.G - s.vel.y * PRO.DRAG_V) * dt;
    s.vel.z += ((up[2] * thrust) / PRO.MASS - s.vel.z * PRO.DRAG_H + wind.accelZ()) * dt;

    s.pos.x += s.vel.x * dt;
    s.pos.y += s.vel.y * dt;
    s.pos.z += s.vel.z * dt;

    const groundY = this.ctx.heightAt(s.pos.x, s.pos.z);
    const floor = groundY + 0.45;
    if (s.pos.y < floor) {
      s.pos.y = floor;
      // 아케이드와 달리 세게 박으면 죽는다.
      if (s.vel.length() > 4.0) this.ctx.onCrash?.('지면 충돌');
      else s.vel.y = 0;
    }
    s.agl = s.pos.y - groundY;

    for (const o of this.ctx.obstacles) {
      const dx = s.pos.x - o.position.x;
      const dz = s.pos.z - o.position.z;
      if (s.pos.y < o.position.y + o.height * 0.5 + 1 && dx * dx + dz * dz < o.radius * o.radius) {
        this.ctx.onCrash?.('구조물 충돌');
        return;
      }
    }
  }
}
