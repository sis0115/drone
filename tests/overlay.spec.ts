import { expect, test } from '@playwright/test';
import { CAMERA, distort, undistort } from '../src/data/render';
import { DEFAULT as POSTFX, PRESETS } from '../src/data/postfx';

/**
 * 배럴 왜곡 ↔ 오버레이 좌표 정합 (07 문서 2.4).
 *
 * 셰이더는 `uv = 0.5 + c*(1 + k*r²)` 로 화면을 밀고,
 * SVG 마커는 `0.5 + c*(1 - k*r²)` 로 당겨야 표적 위에 붙는다.
 * **둘 중 하나만 고치면 즉시 어긋난다** — 그래서 계수 출처가 하나여야 한다.
 */

test('셰이더와 오버레이가 같은 왜곡 계수를 본다', () => {
  // 기본 파라미터가 CAMERA.DISTORT 를 참조한다 — 상수를 두 벌 들고 있으면
  // 튜닝 패널로 한쪽만 바뀌어 마커가 조용히 어긋난다.
  expect(POSTFX.distort).toBe(CAMERA.DISTORT);
  expect(POSTFX.fov).toBe(CAMERA.FOV);
  for (const [name, preset] of Object.entries(PRESETS)) {
    expect(preset.distort, `프리셋 '${name}' 의 왜곡 계수가 어긋났다`).toBe(CAMERA.DISTORT);
  }
});

test('왜곡 ↔ 역왜곡이 정확히 서로를 되돌린다', () => {
  // 프로토타입의 1차 근사는 가장자리에서 2.35% 까지 어긋났다(실측).
  // 뉴턴법으로 푼 지금은 화면 전 영역에서 픽셀 이하로 맞아야 한다.
  let worst = 0;
  for (let x = 0.05; x <= 0.95; x += 0.05) {
    for (let y = 0.05; y <= 0.95; y += 0.05) {
      const [dx, dy] = distort(x, y, CAMERA.DISTORT);
      const [rx, ry] = undistort(dx, dy, CAMERA.DISTORT);
      worst = Math.max(worst, Math.hypot(rx - x, ry - y));
    }
  }
  // 2265px 폭 기준 0.05% ≈ 1px. 락온 박스가 어디서든 표적에 붙는다.
  expect(worst, `왕복 오차 ${(worst * 100).toFixed(4)}%`).toBeLessThan(0.0005);
});

test('화면 중심은 왜곡되지 않는다 — 십자선이 고정인 이유', () => {
  const [x, y] = undistort(0.5, 0.5, CAMERA.DISTORT);
  expect(x).toBeCloseTo(0.5, 6);
  expect(y).toBeCloseTo(0.5, 6);
});

test('가장자리로 갈수록 보정량이 커진다', () => {
  const near = Math.abs(undistort(0.6, 0.5, CAMERA.DISTORT)[0] - 0.6);
  const far = Math.abs(undistort(0.95, 0.5, CAMERA.DISTORT)[0] - 0.95);
  expect(far).toBeGreaterThan(near);
});

test('왜곡을 0 으로 두면 보정도 사라진다', () => {
  for (const p of [[0.2, 0.8], [0.9, 0.1]] as const) {
    const [x, y] = undistort(p[0], p[1], 0);
    expect(x).toBeCloseTo(p[0], 9);
    expect(y).toBeCloseTo(p[1], 9);
  }
});
