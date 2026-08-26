import { expect, test } from '@playwright/test';
import { AoLimit } from '../src/mission/AoLimit';
import { AO } from '../src/data/mission';

/**
 * 작전 구역 — T8b. 안개는 시야를 가릴 뿐 경계가 아니다.
 * 러너(T8c)가 "실패"를 판정하려면 실패할 수 있는 규칙이 먼저 있어야 한다.
 */

const DT = 1 / 60;

test('경계 안은 평온 — 경고 밴드에 들어와야 경고가 뜬다', () => {
  const ao = new AoLimit();
  const deep = ao.update(0, 0, DT);
  expect(deep.warning).toBe(false);
  expect(deep.outside).toBe(false);

  const nearEdge = ao.update(AO.radius_m - AO.warn_band_m + 5, 0, DT);
  expect(nearEdge.warning, '경고 밴드인데 조용하다 — 넘기 전에 알아야 돌아온다').toBe(true);
  expect(nearEdge.outside).toBe(false);
});

test('이탈 후 유예 3초 — 그동안 진행도가 차오르고, 끝나면 만료된다', () => {
  const ao = new AoLimit();
  const out = AO.radius_m + 20;

  let state = ao.update(out, 0, DT);
  expect(state.outside).toBe(true);
  expect(state.progress).toBeLessThan(0.1);
  expect(ao.expired).toBe(false);

  for (let i = 0; i < Math.round(AO.grace_s / DT); i++) state = ao.update(out, 0, DT);
  expect(state.progress).toBe(1);
  expect(ao.expired, '유예가 끝났는데 만료가 아니다').toBe(true);
});

test('복귀하면 유예가 전부 돌아온다 — 부분 누적은 보이지 않는 자원 게임이 된다', () => {
  const ao = new AoLimit();
  const out = AO.radius_m + 20;
  for (let i = 0; i < Math.round((AO.grace_s * 0.8) / DT); i++) ao.update(out, 0, DT);

  ao.update(0, 0, DT); // 복귀
  const again = ao.update(out, 0, DT);
  expect(again.progress, '복귀했는데 유예가 깎여 있다').toBeLessThan(0.1);
});

test('판정은 수평 거리다 — 고도로는 커버리지를 벗어날 수 없다', () => {
  const ao = new AoLimit();
  // x·z 만 받는다 — 시그니처 자체가 이 계약이다. 대각선 거리 확인:
  const diag = AO.radius_m / Math.SQRT2 + 10;
  expect(ao.update(diag, diag, DT).outside).toBe(true);
});

test('경계는 콘텐츠를 덮고 지형 안에 있다', () => {
  // 배치 코드는 ±470 에 뿌리고, 지형은 ±800 이다. 이 사이가 아니면
  // 표적이 규칙 밖에 있거나 이탈 전에 맵 끝이 드러난다.
  expect(AO.radius_m).toBeGreaterThanOrEqual(470);
  expect(AO.radius_m).toBeLessThan(800);
});
