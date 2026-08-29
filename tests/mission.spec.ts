import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { MissionRunner } from '../src/mission/MissionRunner';
import { M2_1 } from '../src/data/missions';

/**
 * 미션 러너 — T8c. GDD 4.5 규칙 4: 실패가 가르친다.
 * 격추 시 원인 1줄의 **재료**(키+수치)가 빠짐없이 조립되는지 본다.
 */

const STRING_KEYS = new Set(
  readFileSync('docs/strings_master.csv', 'utf8')
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0].trim())
    .filter(Boolean),
);

test('자폭 돌입으로 목표를 채우면 완수다 — 기체 손실은 성공의 일부', () => {
  const runner = new MissionRunner(M2_1);
  runner.onStrike();
  const d = runner.finish('자폭 돌입', 42.4);
  expect(d.cleared).toBe(true);
  expect(d.kills).toBe(1);
  expect(d.goal).toBe(M2_1.destroyGoal);
  expect(d.flightSec).toBe(42);
  // SP 정산 (05 문서 4.1): 군용 트럭 40 × 1차수 배율 1.0
  expect(d.spBase).toBe(40);
  // 확인(BDA) 2배 — Ch.1 은 고스트가 자동 확인한다 (05 문서 4.1 "확인 시 80")
  expect(d.spConfirm).toBe(40);
  // 최초 완수 — 프롤로그의 약속을 회수하는 첫 실적 보너스
  expect(d.firstClear).toBe(true);
  expect(d.spFirstClear).toBe(100);
  expect(d.spEarned).toBe(180);
});

test('재도전에는 첫 실적 보너스가 없다 — 반복 파밍으로 나오는 값이 아니다', () => {
  const runner = new MissionRunner(M2_1);
  runner.onStrike();
  const d = runner.finish('자폭 돌입', 30, { alreadyCleared: true }); // 이미 완수한 미션
  expect(d.cleared).toBe(true);
  expect(d.firstClear).toBe(false);
  expect(d.spFirstClear).toBe(0);
  // 격파 40 + 확인 40 — 확인 킬은 매번 유효하다
  expect(d.spEarned).toBe(80);
});

test('기체 손실 페널티 — T2 를 몰면 출격마다 가격의 5% 가 빠진다 (05 문서 4.3)', () => {
  const runner = new MissionRunner(M2_1);
  runner.onStrike();
  // 호넷-10 800 SP → 손실 40. 자폭 드론이라 매 출격 발생하는 유지비다.
  const d = runner.finish('자폭 돌입', 30, { alreadyCleared: true, framePriceSp: 800 });
  expect(d.spLoss).toBe(40);
  expect(d.spEarned).toBe(40); // 격파 40 + 확인 40 − 손실 40
});

test('기본 지급 기체(가격 0)에는 손실 페널티가 없다', () => {
  const runner = new MissionRunner(M2_1);
  runner.onStrike();
  const d = runner.finish('자폭 돌입', 30, { alreadyCleared: true, framePriceSp: 0 });
  expect(d.spLoss).toBe(0);
  expect(d.spEarned).toBe(80);
});

test('출격했다고 빚을 지지는 않는다 — 정산은 0 밑으로 안 내려간다', () => {
  const runner = new MissionRunner(M2_1);
  // 격파 0 + T2 손실: 문서에 차감만 있고 마이너스 잔액 개념은 없다
  const d = runner.finish('피격', 12, { framePriceSp: 800 });
  expect(d.spLoss).toBe(40);
  expect(d.spEarned).toBe(0);
});

test('격파가 없으면 SP 도 없다 — 참가상 금지', () => {
  const runner = new MissionRunner(M2_1);
  const d = runner.finish('지면 충돌', 30);
  expect(d.spEarned).toBe(0);
});

test('목표 미달로 죽으면 실패 — 원인 키가 CSV 에 실제로 있다', () => {
  for (const [reason, key] of [
    ['지면 충돌', 'cause.ground'],
    ['구조물 충돌', 'cause.structure'],
    ['배터리 소진', 'cause.battery'],
    ['작전 구역 이탈', 'cause.ao'],
  ] as const) {
    const runner = new MissionRunner(M2_1);
    const d = runner.finish(reason, 10);
    expect(d.cleared).toBe(false);
    expect(d.causeKey).toBe(key);
    expect(STRING_KEYS.has(d.causeKey), `원인 키가 CSV 에 없다: ${d.causeKey}`).toBe(true);
  }
});

test('위협 격추는 상세가 우선한다 — "원인 + 접근 고도 + 권고" 1줄의 재료', () => {
  const runner = new MissionRunner(M2_1);
  runner.onThreatHit({
    causeKey: 'threat.a1.name',
    agl: 12.3,
    adviceKey: 'threat.a1.advice',
    adviceParams: [30, 6],
  });
  const d = runner.finish('피격', 20);
  expect(d.threat, '피격인데 위협 상세가 없다').toBeTruthy();
  expect(STRING_KEYS.has(d.threat!.causeKey)).toBe(true);
  expect(STRING_KEYS.has(d.threat!.adviceKey)).toBe(true);
  expect(d.threat!.agl).toBeCloseTo(12.3, 5);
});

test('위협이 아닌 죽음에는 위협 상세를 싣지 않는다 — 이전 출격의 잔재 방지', () => {
  const runner = new MissionRunner(M2_1);
  runner.onThreatHit({ causeKey: 'threat.a1.name', agl: 10, adviceKey: 'threat.a1.advice', adviceParams: [] });
  // 조준은 받았지만 실제 죽음은 지면 충돌
  const d = runner.finish('지면 충돌', 5);
  expect(d.threat).toBeNull();
});

test('reset 은 격파 수까지 처음부터다', () => {
  const runner = new MissionRunner(M2_1);
  runner.onStrike();
  runner.finish('자폭 돌입', 10);
  runner.reset();
  const d = runner.finish('배터리 소진', 3);
  expect(d.kills).toBe(0);
  expect(d.cleared).toBe(false);
});

test('미션 정의 규약 — 위협 상한(GDD 4.5 규칙 3)과 문자열 키', () => {
  expect(M2_1.threats.length).toBeLessThanOrEqual(3);
  expect(M2_1.threats.length).toBeGreaterThanOrEqual(1);
  expect(STRING_KEYS.has(M2_1.titleKey), `미션 제목 키가 CSV 에 없다: ${M2_1.titleKey}`).toBe(true);
  expect(M2_1.destroyGoal).toBeGreaterThan(0);
});
