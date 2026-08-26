import { Vector3 } from 'three';
import { ARCADE, ARCADE_WIND_COMPENSATION } from '@/data/flight';
import type { InputFrame } from '@/input/InputSource';
import { FlightState, type FlightContext, type FlightModel } from './FlightModel';

/**
 * 아케이드 — 기본 모드.
 * 기울기 물리 대신 **목표 속도 추종 + 지형 자동 추종**. 조작 난이도를 크게 낮춘다.
 *
 * 입력 매핑이 프로 모드와 다르다 (프로토타입 그대로):
 *   pitch → 전후진 / roll → 선회 / throttle → 목표 고도 / yaw → 횡이동
 * 스틱 하나로 "가고 싶은 방향"이 되게 한 배치다.
 *
 * 실측 재현 대상 (02 문서 4.2): 전진 3초 79.2km/h, 고도 유지 오차 0.08m, 선회 1초 115°
 */
export class ArcadeFlight implements FlightModel {
  readonly mode = 'arcade' as const;
  readonly telemetry = new FlightState();
  readonly shake = { x: 0, y: 0 }; // 아케이드는 화면 밀림 없음

  /** 지면 대비 목표 고도. 언덕을 만나면 알아서 넘어간다. HUD 의 `SET` 표시가 이 값이다. */
  private targetAgl = 18;

  get targetAltitude(): number {
    return this.targetAgl;
  }

  constructor(private readonly ctx: FlightContext) {}

  reset(pos: Vector3, yaw: number): void {
    this.telemetry.reset(pos, yaw);
    this.targetAgl = 18;
  }

  step(input: InputFrame, dt: number): void {
    const s = this.telemetry;
    const fwd = input.pitch;
    const turn = input.roll;
    const climb = input.throttle;
    const strafe = input.yaw;

    s.yaw += turn * ARCADE.turn * dt;

    // 진행 방향 / 우측 벡터
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    const rx = -Math.cos(s.yaw);
    const rz = Math.sin(s.yaw);

    const targetVx = fx * fwd * ARCADE.spd + rx * strafe * ARCADE.strafe;
    const targetVz = fz * fwd * ARCADE.spd + rz * strafe * ARCADE.strafe;
    const k = Math.min(1, dt * ARCADE.acc);
    s.vel.x += (targetVx - s.vel.x) * k;
    s.vel.z += (targetVz - s.vel.z) * k;

    // 바람 — 풀어시스트가 대부분 상쇄하고 남는 만큼만 흐른다.
    const wind = this.ctx.wind;
    s.vel.x += wind.accelX() * ARCADE_WIND_COMPENSATION * dt;
    s.vel.z += wind.accelZ() * ARCADE_WIND_COMPENSATION * dt;

    // 고도: 지형 자동 추종
    this.targetAgl = Math.max(
      ARCADE.aglMin,
      Math.min(ARCADE.aglMax, this.targetAgl + climb * ARCADE.climb * dt),
    );
    const groundY = this.ctx.heightAt(s.pos.x, s.pos.z);
    const targetY = groundY + this.targetAgl;
    s.vel.y += ((targetY - s.pos.y) * ARCADE.aglGain - s.vel.y) * Math.min(1, dt * ARCADE.aglResp);

    s.pos.x += s.vel.x * dt;
    s.pos.y += s.vel.y * dt;
    s.pos.z += s.vel.z * dt;

    // 시각적 기울기 — 물리와 분리된 보기용 값이다.
    const tk = Math.min(1, dt * 5);
    s.pitch += (-fwd * 0.3 - s.pitch) * tk;
    s.roll += (turn * 0.55 - s.roll) * tk;

    // 지면: 죽지 않고 부드럽게 막힌다.
    const floor = groundY + 1.2;
    if (s.pos.y < floor) {
      s.pos.y = floor;
      if (s.vel.y < 0) s.vel.y = 0;
    }
    s.agl = s.pos.y - groundY;

    this.resolveObstacles();
  }

  /** 저속이면 밀려나고, `crashSpeed` 이상이면 격추된다. */
  private resolveObstacles(): void {
    const s = this.telemetry;
    const speed = s.spd;
    for (const o of this.ctx.obstacles) {
      const dx = s.pos.x - o.position.x;
      const dz = s.pos.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      const R = o.radius + 1.2;
      if (s.pos.y < o.position.y + o.height * 0.5 + 1 && d2 < R * R) {
        if (speed > ARCADE.crashSpeed) {
          this.ctx.onCrash?.('구조물 충돌');
        } else {
          const d = Math.max(0.01, Math.sqrt(d2));
          s.pos.x = o.position.x + (dx / d) * R;
          s.pos.z = o.position.z + (dz / d) * R;
          s.vel.x *= 0.2;
          s.vel.z *= 0.2;
        }
        return;
      }
    }
  }
}
