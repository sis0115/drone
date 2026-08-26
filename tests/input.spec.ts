import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import { VirtualPad } from '../src/input/VirtualPad';
import { TouchInput } from '../src/input/TouchInput';
import { ArcadeFlight } from '../src/drone/ArcadeFlight';
import { ProFlight } from '../src/drone/ProFlight';
import { Wind } from '../src/drone/Wind';
import { PAD, STICK_DEADZONE } from '../src/data/controls';
import { ARCADE } from '../src/data/flight';
import { NEUTRAL, type InputFrame } from '../src/input/InputSource';
import type { FlightContext } from '../src/drone/FlightModel';

const CENTER = { x: 100, y: 400 };

test.describe('가상 스틱', () => {
  test('패드 위를 누르면 중심 기준으로 잡는다', () => {
    const pad = new VirtualPad();
    // 중심에서 travel 만큼 오른쪽 = x 축 최대
    pad.grab(1, CENTER.x + PAD.travel, CENTER.y, CENTER);
    expect(pad.value.x).toBeCloseTo(1, 2);
    expect(pad.value.y).toBeCloseTo(0, 2);
  });

  test('패드 밖을 누르면 누른 지점 기준이다 — 손 위치를 안 봐도 된다', () => {
    const pad = new VirtualPad();
    const far = { x: CENTER.x + 300, y: CENTER.y - 200 };
    pad.grab(1, far.x, far.y, CENTER);
    // 잡은 순간에는 중립이어야 한다 (그 지점이 원점이므로)
    expect(pad.value.x).toBe(0);
    expect(pad.value.y).toBe(0);
    pad.move(1, far.x + PAD.travel, far.y);
    expect(pad.value.x).toBeCloseTo(1, 2);
  });

  test('대각선으로 끌어도 크기가 1 을 넘지 않는다', () => {
    const pad = new VirtualPad();
    pad.grab(1, CENTER.x, CENTER.y, CENTER);
    pad.move(1, CENTER.x + PAD.travel * 5, CENTER.y + PAD.travel * 5);
    expect(Math.hypot(pad.value.x, pad.value.y)).toBeCloseTo(1, 3);
  });

  test('미세 떨림은 데드존이 먹는다', () => {
    const pad = new VirtualPad();
    pad.grab(1, CENTER.x, CENTER.y, CENTER);
    pad.move(1, CENTER.x + PAD.travel * (STICK_DEADZONE * 0.5), CENTER.y);
    expect(pad.value.x).toBe(0);
  });

  test('다른 손가락은 이미 잡힌 스틱을 뺏지 못한다', () => {
    const pad = new VirtualPad();
    pad.grab(1, CENTER.x, CENTER.y, CENTER);
    pad.grab(2, CENTER.x + PAD.travel, CENTER.y, CENTER);
    pad.move(2, CENTER.x + PAD.travel, CENTER.y);
    expect(pad.value.x).toBe(0); // 2번 손가락은 무시된다
    pad.release(2);
    expect(pad.active).toBe(true); // 1번은 그대로 잡고 있다
  });
});

test.describe('스틱 배치 (GDD 7장)', () => {
  const pull = (input: TouchInput, side: 'left' | 'right', x: number, y: number): void => {
    const pad = side === 'left' ? input.left : input.right;
    pad.grab(1, CENTER.x, CENTER.y, CENTER);
    pad.move(1, CENTER.x + x * PAD.travel, CENTER.y + y * PAD.travel);
  };

  test('Mode 2 (기본) — 좌 스로틀/요, 우 피치/롤', () => {
    const input = new TouchInput(2);
    pull(input, 'left', 0, -1); // 왼쪽 스틱 위로
    expect(input.sample().throttle).toBeCloseTo(1, 2);
    pull(input, 'right', 0, -1); // 오른쪽 스틱 위로
    expect(input.sample().pitch).toBeCloseTo(1, 2);
  });

  test('Mode 1 — 스로틀이 오른손으로 간다', () => {
    const input = new TouchInput(1);
    pull(input, 'left', 0, -1);
    expect(input.sample().pitch).toBeCloseTo(1, 2);
    pull(input, 'right', 0, -1);
    expect(input.sample().throttle).toBeCloseTo(1, 2);
  });

  test('화면 좌우 절반이 각각 한 스틱을 담당한다', () => {
    const input = new TouchInput();
    expect(input.padFor(100, 800)).toBe(input.left);
    expect(input.padFor(700, 800)).toBe(input.right);
  });
});

/**
 * T4 완료 조건 — **스크립트 입력으로 8자 비행**.
 *
 * 아케이드 선회율 2.0 rad/s 이므로 한 바퀴(2π rad)에 π초.
 * 왼쪽 한 바퀴 + 오른쪽 한 바퀴 = 8자이고, 출발점으로 돌아와야 한다.
 */
test('스크립트 입력으로 8자를 그린다', () => {
  const wind = new Wind();
  wind.calm();
  const ctx: FlightContext = { heightAt: () => 0, obstacles: [], wind };
  const m = new ArcadeFlight(ctx);
  const start = new Vector3(0, 18, 0);
  m.reset(start, Math.PI);

  const DT = 1 / 120;
  const LAP = (2 * Math.PI) / ARCADE.turn; // 한 바퀴(2π rad)에 걸리는 시간
  const path: Vector3[] = [];
  let netYaw = 0;
  let leftTurn = 0;
  let rightTurn = 0;

  // 먼저 속도를 붙인다 (정지에서 시작하면 첫 바퀴 반경이 찌그러진다)
  for (let t = 0; t < 3; t += DT) m.step({ ...NEUTRAL, pitch: 1 }, DT);

  const fly = (roll: number, seconds: number): void => {
    for (let t = 0; t < seconds; t += DT) {
      const before = m.telemetry.yaw;
      m.step({ ...NEUTRAL, pitch: 1, roll } as InputFrame, DT);
      const d = m.telemetry.yaw - before;
      netYaw += d;
      if (d > 0) leftTurn += d;
      else rightTurn += -d;
      path.push(m.telemetry.pos.clone());
    }
  };

  const loopStart = m.telemetry.pos.clone();
  fly(1, LAP);   // 한쪽 원
  fly(-1, LAP);  // 반대쪽 원

  // 양쪽으로 각각 한 바퀴씩 돌았다
  expect(leftTurn).toBeCloseTo(Math.PI * 2, 1);
  expect(rightTurn).toBeCloseTo(Math.PI * 2, 1);
  // 합치면 제자리 — 8자의 정의
  expect(Math.abs(netYaw)).toBeLessThan(0.05);

  // 출발점 근처로 돌아왔다 (원 반경 = spd/turn ≈ 11m 기준 여유 있게)
  const back = m.telemetry.pos.distanceTo(loopStart);
  expect(back, `8자를 그렸는데 ${back.toFixed(1)}m 떨어져 끝났다`).toBeLessThan(6);

  // 두 로브가 실제로 반대편에 있다 — 한쪽으로만 돈 게 아니다
  const half = path.length / 2;
  const lobeA = path.slice(0, half).reduce((a, p) => a + p.x, 0) / half;
  const lobeB = path.slice(half).reduce((a, p) => a + p.x, 0) / half;
  expect(Math.sign(lobeA - loopStart.x)).not.toBe(Math.sign(lobeB - loopStart.x));
});

test('ACRO 는 스틱을 놓아도 수평으로 돌아오지 않는다 (GDD 7장 어시스트 ③)', () => {
  const wind = new Wind();
  wind.calm();
  const ctx: FlightContext = { heightAt: () => 0, obstacles: [], wind };
  const DT = 1 / 120;

  const semi = new ProFlight(ctx, 'semi');
  const acro = new ProFlight(ctx, 'acro');
  for (const m of [semi, acro]) m.reset(new Vector3(0, 50, 0), Math.PI);

  // 같은 시간만큼 눕힌 뒤 스틱을 놓는다
  for (let t = 0; t < 0.4; t += DT) {
    semi.step({ ...NEUTRAL, roll: 1 }, DT);
    acro.step({ ...NEUTRAL, roll: 1 }, DT);
  }
  for (let t = 0; t < 1.0; t += DT) {
    semi.step({ ...NEUTRAL }, DT);
    acro.step({ ...NEUTRAL }, DT);
  }

  expect(Math.abs(semi.telemetry.roll), '세미는 수평으로 복귀해야 한다').toBeLessThan(0.02);
  expect(Math.abs(acro.telemetry.roll), 'ACRO 는 기울기가 유지되어야 한다').toBeGreaterThan(0.3);
});
