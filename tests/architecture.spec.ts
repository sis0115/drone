import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 계층 규칙을 **문서가 아니라 테스트로 강제**한다.
 *
 * 구조는 적어 두면 무너진다. 세션이 바뀌고 급할 때 위쪽 계층을 아래에서 부르는
 * 지름길이 하나씩 생기고, 그러다 `main.ts` 가 다시 만능 파일이 된다.
 * 여기서 막는다.
 *
 * 의존 방향 (위 → 아래만 허용):
 *   main → app → {ui, render, world, drone, input, mission, economy} → core → platform → {data, i18n}
 */
const LAYERS: Record<string, number> = {
  app: 5,
  ui: 4,
  render: 4,
  world: 4,
  drone: 4,
  input: 4,
  mission: 4,
  economy: 4,
  core: 3,
  platform: 2,
  data: 1,
  i18n: 1,
};

/** 같은 층끼리 부르면 안 되는 조합 — 옆으로 새는 의존을 막는다. */
const SIBLING_BANS: [string, string][] = [
  ['world', 'render'], // 씬 생성이 렌더러를 알면 헤드리스 씬 검사가 불가능해진다
  ['world', 'ui'],
  ['drone', 'render'],
  ['drone', 'ui'],
  ['render', 'world'],
  ['input', 'render'],
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function layerOf(file: string): string | null {
  const m = file.match(/^src\/([^/]+)\//);
  return m ? m[1] : null;
}

/** `@/x/...` 와 상대 경로 import 를 모두 잡아 대상 계층을 돌려준다. */
function importedLayers(file: string, body: string): string[] {
  const layers = new Set<string>();
  const own = layerOf(file);
  for (const m of body.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith('@/')) {
      const seg = spec.slice(2).split('/')[0];
      if (seg in LAYERS) layers.add(seg);
    } else if (spec.startsWith('.')) {
      // 상대 경로는 같은 계층이거나 상위로 올라간다. `../../x/` 형태만 계층으로 친다.
      const up = spec.match(/(?:\.\.\/)+([^/]+)\//);
      if (up && up[1] in LAYERS) layers.add(up[1]);
      else if (own) layers.add(own);
    }
  }
  return [...layers];
}

test('계층 의존 방향이 지켜진다 — 아래가 위를 부르지 않는다', () => {
  const violations: string[] = [];

  for (const file of sourceFiles('src')) {
    const from = layerOf(file);
    if (!from || !(from in LAYERS)) continue;
    const body = readFileSync(file, 'utf8');

    for (const to of importedLayers(file, body)) {
      if (to === from) continue;
      if (LAYERS[to] > LAYERS[from]) {
        violations.push(`${file}\n    → '${to}' (상위 계층을 부른다: ${from}=${LAYERS[from]} < ${to}=${LAYERS[to]})`);
      }
      if (SIBLING_BANS.some(([a, b]) => a === from && b === to)) {
        violations.push(`${file}\n    → '${to}' (같은 층 금지 조합: ${from} ↛ ${to})`);
      }
    }
  }

  expect(violations, `계층 위반:\n  ${violations.join('\n  ')}`).toEqual([]);
});

test('data / i18n 은 게임 코드를 부르지 않는다 — 순수 데이터여야 한다', () => {
  const bad: string[] = [];
  for (const file of [...sourceFiles('src/data'), ...sourceFiles('src/i18n')]) {
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/from\s+'(@\/[^']+)'/g)) {
      const seg = m[1].slice(2).split('/')[0];
      if (seg !== 'data' && seg !== 'i18n') bad.push(`${file} → ${m[1]}`);
    }
  }
  expect(bad, `순수 데이터 계층 위반:\n  ${bad.join('\n  ')}`).toEqual([]);
});

test('main.ts 는 배선만 한다 — 길어지면 구조가 무너지고 있다는 신호', () => {
  const lines = readFileSync('src/main.ts', 'utf8').split('\n').filter((l) => l.trim()).length;
  expect(lines, 'main.ts 가 너무 길다. App/화면으로 옮길 것').toBeLessThan(30);
});

test('world/ 는 브라우저 없이 씬을 지을 수 있어야 한다 — 렌더러 비의존', () => {
  const bad: string[] = [];
  for (const file of sourceFiles('src/world')) {
    const body = readFileSync(file, 'utf8');
    if (/WebGLRenderer|from '@\/render/.test(body)) bad.push(file);
  }
  expect(bad, `world/ 가 렌더러에 의존한다 (npm run scene 이 깨진다):\n  ${bad.join('\n  ')}`).toEqual([]);
});
