import { expect, test } from '@playwright/test';
import { buildWorld } from '../src/world/SceneBuilder';
import { WORLD_SEED } from '../src/data/world';
import { installDomStubs } from '../tools/dom-stub.mjs';

installDomStubs();

/**
 * 월드 재현성. 점검 스윕에서 **새로고침마다 지형지물이 달라졌다** —
 * 미션(T8)이 "엄폐물 뒤로 접근" 같은 설계를 하려면 배치가 재현돼야 한다.
 */

/** 씬 안 모든 오브젝트의 위치를 한 줄로 접는다. 배치가 1cm라도 다르면 값이 달라진다. */
function layoutFingerprint(scene: import('three').Object3D): string {
  const parts: string[] = [];
  scene.traverse((o) => {
    parts.push(`${o.type}:${o.position.x.toFixed(3)},${o.position.y.toFixed(3)},${o.position.z.toFixed(3)}`);
  });
  return parts.join('|');
}

test('같은 시드는 같은 배치를 만든다', () => {
  const a = layoutFingerprint(buildWorld().scene);
  const b = layoutFingerprint(buildWorld().scene);
  expect(b, '같은 시드인데 맵이 달라진다 — 배치 난수가 시드 밖에 있다').toBe(a);
});

test('다른 시드는 다른 배치를 만든다 — 시드가 실제로 먹는다', () => {
  const a = layoutFingerprint(buildWorld({ seed: WORLD_SEED }).scene);
  const b = layoutFingerprint(buildWorld({ seed: WORLD_SEED + 1 }).scene);
  expect(b, '시드를 바꿔도 맵이 같다 — 시드가 배선되지 않았다').not.toBe(a);
});

test('표적·장애물 개수는 시드와 무관하게 고정이다', () => {
  // 개수가 시드에 따라 흔들리면 드로우콜 예산과 미션 난이도가 같이 흔들린다.
  const a = buildWorld({ seed: 1 });
  const b = buildWorld({ seed: 999 });
  expect(b.targets.length).toBe(a.targets.length);
  expect(b.obstacles.length).toBe(a.obstacles.length);
  expect(b.registry.pairs.length).toBe(a.registry.pairs.length);
});
