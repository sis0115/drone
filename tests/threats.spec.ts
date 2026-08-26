import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import {
  BaseThreat,
  ShotgunInfantry,
  JammerDome,
  ThreatRunner,
  type ThreatEffect,
  type ThreatSense,
} from '../src/mission/threats';
import { A1_SHOTGUN, B1_JAMMER, TELEGRAPH_MIN_S } from '../src/data/threats';
import { SignalModel } from '../src/core/SignalModel';
import { SIGNAL } from '../src/data/render';
import { readFileSync } from 'node:fs';

/**
 * 위협 프레임워크 — GDD 4.5.
 *
 * 여기서 지키려는 것은 위협 2종의 수치가 아니라 **규칙 1(모든 위협은 예고된다)** 이다.
 * 위협은 앞으로 16종까지 늘어난다. 규칙을 위협마다 재구현하면 반드시 하나가 빠지고,
 * 그때 생기는 버그는 "가끔 예고 없이 죽는다"라서 재현이 안 된다.
 */

const DT = 1 / 60;

/**
 * 문자열 원본을 파일에서 직접 읽는다. `src/i18n` 을 import 하면 Vite 의 `?raw` 를
 * 노드가 못 읽어 스펙 전체가 안 뜬다 — 헤드리스 테스트는 원본 CSV 를 본다.
 */
const STRING_KEYS = new Set(
  readFileSync('docs/strings_master.csv', 'utf8')
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0].trim())
    .filter(Boolean),
);

/** 위협을 `steps` 프레임 굴리고 마지막 프레임의 결과를 돌려준다. */
function run(runner: ThreatRunner, sense: Omit<ThreatSense, 'dt'>, seconds: number) {
  let last = runner.update({ ...sense, dt: DT });
  const kills = [];
  for (let i = 1; i < Math.round(seconds / DT); i++) {
    last = runner.update({ ...sense, dt: DT });
    if (last.kill) kills.push(last.kill);
  }
  return { last, kills };
}

const at = (x: number, z: number) => new Vector3(x, 0, z);
const drone = (x: number, z: number, agl: number) => ({ pos: new Vector3(x, agl, z), agl, speed: 12 });

test('A1 — 위험 반경 안 · 노출 고도면 조준이 시작된다', () => {
  const a1 = new ShotgunInfantry(at(0, 0));
  const runner = new ThreatRunner([a1]);
  const { last } = run(runner, drone(0, 30, 14), 0.3);

  expect(last.warning?.id).toBe('A1');
  expect(last.warning?.kind, '반경 안인데 조준이 안 걸린다').toBe('aim');
  expect(last.warning?.armed, `${TELEGRAPH_MIN_S}초 전인데 벌써 격추 가능 상태다`).toBe(false);
});

test('A1 — 격추는 예고 0.5초 계약을 통과한 뒤에만 나온다', () => {
  const a1 = new ShotgunInfantry(at(0, 0));
  const runner = new ThreatRunner([a1]);
  const { kills } = run(runner, drone(0, 30, 14), A1_SHOTGUN.aim_s + 0.1);

  expect(kills.length, '조준을 끝냈는데 격추가 없다').toBe(1);
  expect(kills[0].threatId).toBe('A1');
  expect(kills[0].agl).toBeCloseTo(14, 5);
  // 규칙 4: 실패가 가르친다 — 원인과 대응이 같이 온다
  // 문장이 아니라 키 + 수치로 온다 — 조립은 디브리핑(T8)의 일이다
  expect(STRING_KEYS.has(kills[0].causeKey), `문자열 키가 CSV 에 없다: ${kills[0].causeKey}`).toBe(true);
  expect(STRING_KEYS.has(kills[0].adviceKey), `문자열 키가 CSV 에 없다: ${kills[0].adviceKey}`).toBe(true);
  expect(kills[0].adviceParams).toContain(A1_SHOTGUN.ceiling_agl_m);
  expect(kills[0].adviceParams).toContain(A1_SHOTGUN.cover_agl_m);
  expect(runner.violations, `계약 위반:\n${runner.violations.join('\n')}`).toEqual([]);
  // 조준 시간이 계약보다 짧으면 애초에 예고가 성립하지 않는다
  expect(A1_SHOTGUN.aim_s).toBeGreaterThanOrEqual(TELEGRAPH_MIN_S);
});

test('A1 — 대응 3종이 전부 통한다: 우회 · 상승 · 급강하 (규칙 2)', () => {
  for (const [label, pos] of [
    ['우회(반경 밖)', drone(0, A1_SHOTGUN.danger_m + 5, 14)],
    ['상승(천장 위)', drone(0, 20, A1_SHOTGUN.ceiling_agl_m + 5)],
    ['급강하(엄폐 아래)', drone(0, 20, A1_SHOTGUN.cover_agl_m - 2)],
  ] as const) {
    const runner = new ThreatRunner([new ShotgunInfantry(at(0, 0))]);
    const { kills, last } = run(runner, pos, 6);
    expect(kills.length, `${label} 로 피했는데 격추됐다`).toBe(0);
    expect(last.warning?.kind, `${label} 인데 조준이 유지된다`).not.toBe('aim');
  }
});

test('A1 — 스쳐 지나가면 조준 진행이 남지 않는다', () => {
  // 부분 진행이 누적되면 "여러 번 스친 것"만으로 예고 없이 죽는다.
  const a1 = new ShotgunInfantry(at(0, 0));
  const runner = new ThreatRunner([a1]);
  for (let pass = 0; pass < 5; pass++) {
    run(runner, drone(0, 30, 14), A1_SHOTGUN.aim_s * 0.5); // 조준 절반
    run(runner, drone(0, 400, 14), 0.2); // 멀리 이탈
  }
  expect(a1.aimProgress, '이탈했는데 조준이 남아 있다').toBe(0);
  const { kills } = run(runner, drone(0, 30, 14), A1_SHOTGUN.aim_s * 0.6);
  expect(kills.length, '누적된 조준으로 예고보다 빨리 쐈다').toBe(0);
});

test('A1 — 발사 후 재장전 동안은 다시 쏘지 못한다', () => {
  const runner = new ThreatRunner([new ShotgunInfantry(at(0, 0))]);
  const { kills } = run(runner, drone(0, 30, 14), A1_SHOTGUN.aim_s + A1_SHOTGUN.reload_s * 0.8);
  expect(kills.length, '재장전 중에 또 쐈다').toBe(1);
});

test('B1 — 죽이지 않고 신호만 뺏는다. 경계에서 매끄럽게 무너진다', () => {
  const b1 = new JammerDome(at(0, 0));
  const runner = new ThreatRunner([b1]);

  const outside = runner.update({ ...drone(0, B1_JAMMER.radius_m + B1_JAMMER.warn_band_m + 10, 20), dt: DT });
  expect(outside.jam).toBe(0);
  expect(outside.warning, '한참 밖인데 예고가 뜬다').toBeNull();

  // 진입 전 예고 밴드 — 들어가기 **전에** 알아야 우회가 성립한다
  const band = runner.update({ ...drone(0, B1_JAMMER.radius_m + 10, 20), dt: DT });
  expect(band.warning?.kind).toBe('field');

  const edge = runner.update({ ...drone(0, B1_JAMMER.radius_m - 5, 20), dt: DT });
  const mid = runner.update({ ...drone(0, (B1_JAMMER.radius_m + B1_JAMMER.core_m) / 2, 20), dt: DT });
  const core = runner.update({ ...drone(0, B1_JAMMER.core_m - 5, 20), dt: DT });

  expect(edge.jam).toBeLessThan(mid.jam);
  expect(mid.jam).toBeLessThan(core.jam);
  expect(core.jam).toBeCloseTo(1, 3);
  expect(edge.jam, '경계에서 계단처럼 튄다 — 재밍이 아니라 고장으로 읽힌다').toBeLessThan(0.2);

  const { kills } = run(runner, drone(0, 0, 20), 8);
  expect(kills.length, 'B1 은 격추하지 않는다').toBe(0);
});

test('B1 감쇠 1.0 은 프로토타입의 boolean 재밍과 같은 값이다', () => {
  // 검증된 상수(SIGNAL.jammed)를 바꾼 것이 아니라 그 사이를 채운 것임을 고정한다.
  const graded = new SignalModel();
  const boolean = new SignalModel();
  const base = { distance: 0, losBlocked: 0, falloff: 1 };
  for (let i = 0; i < 200; i++) {
    graded.update({ ...base, jam: 1 }, DT, 0);
    boolean.update({ ...base, jam: 1 }, DT, 0);
  }
  expect(graded.quality).toBeCloseTo(boolean.quality, 10);
  // 최대 재밍이면 1 + SIGNAL.jammed 로 수렴한다
  expect(graded.quality).toBeCloseTo(1 + SIGNAL.jammed, 2);
});

test('러너가 계약을 강제한다 — 예고 없이 쏘는 위협은 격추가 폐기된다', () => {
  /** 규칙을 안 읽은 위협. 프레임워크가 대신 막아야 한다. */
  class Cheater extends BaseThreat {
    readonly id = 'A1' as const;
    update(): ThreatEffect {
      return { jam: 0, kill: { threatId: 'A1', causeKey: 'threat.a1.name', agl: 10, adviceKey: 'threat.a1.advice', adviceParams: [] } };
    }
  }
  const runner = new ThreatRunner([new Cheater(at(0, 0))]);
  const { kills } = run(runner, drone(0, 10, 10), 2);

  expect(kills.length, '예고 없는 격추가 통과했다 — 계약이 안 걸린다').toBe(0);
  expect(runner.violations.length, '위반이 기록되지 않았다 — 조용히 넘기면 못 잡는다').toBeGreaterThan(0);
  expect(runner.violations[0]).toContain('A1');
});

test('러너가 계약을 강제한다 — 예고를 발사 직전에 지워도 폐기된다', () => {
  class Feint extends BaseThreat {
    readonly id = 'A1' as const;
    private t = 0;
    update(sense: ThreatSense): ThreatEffect {
      this.t += sense.dt;
      if (this.t < 1) {
        this.warn('aim', this.t, 10, sense.dt);
        return { jam: 0, kill: null };
      }
      // 예고를 지우고 같은 프레임에 쏜다 — 화면에서는 "예고가 사라지자마자 죽는" 것
      this.clearWarning();
      return { jam: 0, kill: { threatId: 'A1', causeKey: 'threat.a1.name', agl: 10, adviceKey: 'threat.a1.advice', adviceParams: [] } };
    }
  }
  const runner = new ThreatRunner([new Feint(at(0, 0))]);
  const { kills } = run(runner, drone(0, 10, 10), 1.5);
  expect(kills.length).toBe(0);
  expect(runner.violations.length).toBeGreaterThan(0);
});

test('여러 위협이 겹쳐도 감쇠는 합산되지 않는다', () => {
  const runner = new ThreatRunner([new JammerDome(at(0, 0)), new JammerDome(at(10, 0))]);
  const frame = runner.update({ ...drone(0, 0, 20), dt: DT });
  expect(frame.jam).toBeLessThanOrEqual(1);
  expect(frame.jam).toBeCloseTo(1, 3);
});

test('HUD 는 가장 급한 예고 하나를 고른다 — 조준이 존재보다 우선', () => {
  const a1 = new ShotgunInfantry(at(0, 0));
  const b1 = new JammerDome(at(0, 20));
  const runner = new ThreatRunner([b1, a1]); // 등록 순서와 무관해야 한다
  const { last } = run(runner, drone(0, 30, 14), 0.3);
  expect(last.warnings.length, '두 위협이 다 예고 중이어야 한다').toBe(2);
  expect(last.warning?.id, '재밍 예고가 조준 예고를 가렸다').toBe('A1');
});

test('reset 이 위협과 위반 기록을 모두 되돌린다', () => {
  const runner = new ThreatRunner([new ShotgunInfantry(at(0, 0))]);
  run(runner, drone(0, 30, 14), A1_SHOTGUN.aim_s + 0.1);
  runner.reset();
  const first = runner.update({ ...drone(0, 30, 14), dt: DT });
  expect(first.kill, 'reset 후 첫 프레임에 격추가 나온다 — 조준이 남아 있었다').toBeNull();
  expect(runner.violations).toEqual([]);
});
