import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import { ArcadeFlight } from '../src/drone/ArcadeFlight';
import { ProFlight } from '../src/drone/ProFlight';
import { Wind } from '../src/drone/Wind';
import { NEUTRAL, type InputFrame } from '../src/input/InputSource';
import { ARCADE, PRO, VERIFIED } from '../src/data/flight';
import type { FlightContext, FlightModel } from '../src/drone/FlightModel';

/**
 * 02 문서 4.1/4.2 의 **실측값 재현** 테스트.
 *
 * 이 수치들은 프로토타입에서 측정해 문서에 박아 둔 기준선이다.
 * 여기가 깨지면 물리 상수를 누가 건드렸다는 뜻이고, 그건 절대 규칙 1 위반이다.
 *
 * 바람은 끄고 잰다 — 측정 재현성을 위해서이자, 문서의 수치가
 * 바람 없는 조건에서 나온 값이기 때문이다.
 */

const DT = 1 / 60;
const KMH = 3.6;

function context(): FlightContext {
  const wind = new Wind();
  wind.calm();
  return { heightAt: () => 0, obstacles: [], wind };
}

function sim(model: FlightModel, input: Partial<InputFrame>, seconds: number): void {
  const frame: InputFrame = { ...NEUTRAL, ...input };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) model.step(frame, DT);
}

function pro(): ProFlight {
  const m = new ProFlight(context());
  m.reset(new Vector3(0, 50, 0), Math.PI);
  return m;
}

function arcade(yaw = Math.PI): ArcadeFlight {
  const m = new ArcadeFlight(context());
  m.reset(new Vector3(0, 18, 0), yaw);
  return m;
}

test.describe('프로 모드 (02 문서 4.1)', () => {
  test('호버 10초 드리프트 0m — 입력이 없으면 제자리에 선다', () => {
    const m = pro();
    sim(m, {}, 10);
    const drift = Math.hypot(m.telemetry.pos.x, m.telemetry.pos.z);
    expect(drift).toBeCloseTo(VERIFIED.pro.hoverDrift10s_m, 4);
  });

  test('호버 중 고도가 유지된다 — VS 어시스트', () => {
    const m = pro();
    sim(m, {}, 10);
    // 수직 어시스트가 목표 상승률 0 을 잡으므로 낙하하지 않는다.
    expect(m.telemetry.vel.y).toBeCloseTo(0, 2);
    expect(m.telemetry.pos.y).toBeGreaterThan(45);
  });

  test('10초 스프린트가 문서 실측치(73.8km/h)를 재현한다', () => {
    const m = pro();
    sim(m, { pitch: 1 }, 10);
    const kmh = Math.hypot(m.telemetry.vel.x, m.telemetry.vel.z) * KMH;
    expect(kmh).toBeCloseTo(VERIFIED.pro.sprint10s_kmh, 0);
  });

  test('끝까지 가속하면 78.8km/h 에서 수렴한다 — 진짜 상한', () => {
    const m = pro();
    sim(m, { pitch: 1 }, 30);
    const kmh = Math.hypot(m.telemetry.vel.x, m.telemetry.vel.z) * KMH;
    expect(kmh).toBeCloseTo(VERIFIED.pro.topSpeed_kmh, 0);
    // 해석해: MAX_TILT 32° 에서 수평 가속 = sin32°·thrust/MASS, 항력 평형 v = a/DRAG_H
    const cp = Math.cos(PRO.MAX_TILT);
    const thrust = (PRO.MASS * PRO.G) / cp;
    const analytic = ((Math.sin(PRO.MAX_TILT) * thrust) / PRO.MASS / PRO.DRAG_H) * KMH;
    expect(kmh).toBeCloseTo(analytic, 0); // 시뮬레이션이 해석해와 맞는다
  });

  test('관성이 남는다 — 입력을 놓아도 즉시 서지 않는다', () => {
    const m = pro();
    sim(m, { pitch: 1 }, 8);
    const before = Math.hypot(m.telemetry.vel.x, m.telemetry.vel.z);
    sim(m, {}, 0.5);
    const after = Math.hypot(m.telemetry.vel.x, m.telemetry.vel.z);
    expect(after).toBeGreaterThan(before * 0.5); // 절반 이상 남아 있어야 "관성"이다
  });

  test('급기동이 화면 밀림을 만든다', () => {
    const m = pro();
    sim(m, { roll: 1 }, 0.2);
    expect(Math.abs(m.shake.x)).toBeGreaterThan(0);
  });
});

test.describe('아케이드 모드 (02 문서 4.2)', () => {
  test('전진 3초 속도가 문서 실측치와 일치한다', () => {
    const m = arcade();
    sim(m, { pitch: 1 }, 3);
    expect(m.telemetry.spd * KMH).toBeCloseTo(VERIFIED.arcade.forward3s_kmh, 0);
  });

  test('선회 1초 각도가 문서 실측치와 일치한다', () => {
    const m = arcade(0);
    sim(m, { roll: 1 }, 1);
    const deg = (m.telemetry.yaw * 180) / Math.PI;
    expect(deg).toBeCloseTo(VERIFIED.arcade.turn1s_deg, 0);
  });

  test('고도 유지 오차가 문서 실측치 이내다', () => {
    const m = arcade();
    sim(m, { pitch: 1 }, 12); // 안정될 때까지
    expect(Math.abs(m.telemetry.agl - 18)).toBeLessThanOrEqual(VERIFIED.arcade.aglError_m);
  });

  /**
   * 경사면 추종. 고도 제어가 비례 게인이라 오르막에서는 **원리적으로 뒤처진다.**
   * 정상상태 오차 = (지면 상승률) / aglGain = (경사 × 수평속도) / 2.4.
   * 이 관계가 깨지면 고도 제어 상수를 누가 건드렸다는 뜻이다.
   */
  test('경사면을 추종하되, 지연은 제어 게인이 결정한다', () => {
    for (const slope of [0.06, 0.12, 0.3]) {
      const wind = new Wind();
      wind.calm();
      const ctx: FlightContext = { heightAt: (x) => Math.max(0, x * slope), obstacles: [], wind };
      const m = new ArcadeFlight(ctx);
      m.reset(new Vector3(0, 18, 0), -Math.PI / 2); // 전진 벡터가 (-sin yaw, -cos yaw) 이므로 +x
      sim(m, { pitch: 1 }, 14);

      expect(m.telemetry.pos.x, `경사 ${slope}: 전진하지 않았다`).toBeGreaterThan(50);

      const predicted = (slope * ARCADE.spd) / ARCADE.aglGain;
      const lag = 18 - m.telemetry.agl; // 오르막이라 목표보다 낮게 따라간다
      // 상대 오차 10% — 이산 적분의 반스텝 편향은 흡수하되,
      // 게인이 바뀌면(2.4 → 다른 값) 지연이 배수로 어긋나므로 반드시 걸린다.
      expect(
        Math.abs(lag - predicted) / predicted,
        `경사 ${slope}: 지연 ${lag.toFixed(2)}m, 예측 ${predicted.toFixed(2)}m`,
      ).toBeLessThan(0.1);
    }
  });

  test('평지에서는 지연이 없다', () => {
    const m = arcade();
    sim(m, { pitch: 1 }, 14);
    expect(Math.abs(m.telemetry.agl - 18)).toBeLessThanOrEqual(VERIFIED.arcade.aglError_m);
  });

  test('입력을 놓으면 3초 안에 선다 — 프로와 달리 관성이 거의 없다', () => {
    const m = arcade();
    sim(m, { pitch: 1 }, 5);
    let t = 0;
    while (m.telemetry.spd > 0.5 && t < 10) {
      m.step({ ...NEUTRAL }, DT);
      t += DT;
    }
    expect(t).toBeLessThanOrEqual(3.0);
  });

  test('장애물에 저속으로 닿으면 밀려나고 격추되지 않는다', () => {
    const wind = new Wind();
    wind.calm();
    let crashed: string | null = null;
    const ctx: FlightContext = {
      heightAt: () => 0,
      obstacles: [{ position: new Vector3(30, 18, 0), radius: 5, height: 10, box: null as never }],
      wind,
      onCrash: (r) => (crashed = r),
    };
    const m = new ArcadeFlight(ctx);
    m.reset(new Vector3(25, 18, 0), Math.PI);
    // 저속으로 장애물에 붙인다
    m.step({ ...NEUTRAL, yaw: 0.1 }, DT);
    m.telemetry.pos.set(30.5, 18, 0);
    m.step({ ...NEUTRAL }, DT);

    expect(crashed).toBeNull();
    expect(Math.hypot(m.telemetry.pos.x - 30, m.telemetry.pos.z)).toBeGreaterThanOrEqual(6.2);
  });
});

test('두 모드는 같은 입력에 다르게 반응한다 — 분기가 실제로 갈린다', () => {
  const a = arcade();
  const p = pro();
  sim(a, { pitch: 1 }, 2);
  sim(p, { pitch: 1 }, 2);
  expect(a.telemetry.spd).not.toBeCloseTo(p.telemetry.spd, 1);
  expect(a.mode).toBe('arcade');
  expect(p.mode).toBe('pro');
});
