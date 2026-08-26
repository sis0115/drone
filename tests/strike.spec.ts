import { expect, test } from '@playwright/test';
import { findImpact, TARGET_CENTER_Y } from '../src/mission/Strike';
import { HIT_RADIUS } from '../src/data/flight';

/**
 * 자폭 돌입 판정 — T8a. 무장이 아니라 기체가 탄이다.
 * 판정 수식은 프로토타입 v0.7 `hitTargets()` 를 그대로 옮긴 것 — 여기 상수를
 * 바꾸면 "박기 쉬움"이 바뀌므로 실측 기준(02 문서 4장)에 묶어 둔다.
 */

const at = (x: number, y: number, z: number, alive = true) => ({
  alive,
  group: { position: { x, y, z } },
});

test('판정 반경 — 아케이드가 프로보다 관대하다 (어시스트를 끄면 정확히 박아야 한다)', () => {
  const target = at(0, 0, 0);
  // 프로 반경 밖 · 아케이드 반경 안의 지점
  const pos = { x: HIT_RADIUS.pro + 1, y: TARGET_CENTER_Y, z: 0 };
  expect(findImpact(pos, [target], 'arcade'), '아케이드 반경 안인데 기폭이 없다').toBeTruthy();
  expect(findImpact(pos, [target], 'pro'), '프로 반경 밖인데 기폭됐다').toBeNull();
});

test('판정은 3D 거리다 — 표적 위로 높이 지나가면 기폭하지 않는다', () => {
  const target = at(0, 0, 0);
  const over = { x: 0, y: TARGET_CENTER_Y + HIT_RADIUS.arcade + 2, z: 0 };
  expect(findImpact(over, [target], 'arcade'), '고공 통과인데 기폭됐다').toBeNull();
  const dive = { x: 0, y: TARGET_CENTER_Y + HIT_RADIUS.arcade - 0.5, z: 0 };
  expect(findImpact(dive, [target], 'arcade'), '강하 돌입인데 기폭이 없다').toBeTruthy();
});

test('죽은 표적에는 기폭하지 않는다 — 잔해에 두 번 박지 않게', () => {
  const dead = at(0, 0, 0, false);
  expect(findImpact({ x: 0, y: TARGET_CENTER_Y, z: 0 }, [dead], 'arcade')).toBeNull();
});

test('반경 안에 여럿이면 가장 가까운 것 하나만 — 폭발은 한 번이다', () => {
  const near = at(0, 0, 2);
  const far = at(0, 0, 5);
  const hit = findImpact({ x: 0, y: TARGET_CENTER_Y, z: 0 }, [far, near], 'arcade');
  expect(hit?.target).toBe(near);
  expect(hit?.distance).toBeCloseTo(2, 5);
});

test('판정 상수는 실측 기준 그대로다 (02 문서 4장)', () => {
  expect(HIT_RADIUS.arcade).toBe(7.0);
  expect(HIT_RADIUS.pro).toBe(4.2);
  expect(TARGET_CENTER_Y).toBe(2);
});
