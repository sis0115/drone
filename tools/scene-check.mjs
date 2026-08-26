// 브라우저 없이 src/ 의 씬 생성 코드를 실행해 드로우콜·삼각형을 잰다.
//
// tools/perf.js 는 `prototype/` HTML 을 재는 도구고, 이쪽은 **코드베이스**를 잰다.
// T2 이식이 진행되는 동안 두 수치를 나란히 놓고 비교하는 것이 목적이다.
//
// vite 대신 esbuild 로 직접 번들한다 — dev 서버를 띄우지 않아 빠르고,
// 종료 시 esbuild 서비스와 경합해 나오던 deadlock 노이즈도 없다.
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDomStubs } from './dom-stub.mjs';

installDomStubs();

// 번들은 **프로젝트 안**에 둬야 한다 — /tmp 에 두면 external 로 남긴 three 를
// node 가 해석하지 못한다 (node_modules 탐색이 프로젝트 밖에서 끊긴다).
const outDir = join(process.cwd(), 'node_modules', '.slfpv-scene-check');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'scene.mjs');
let failed = false;

try {
  await build({
    entryPoints: ['src/world/SceneBuilder.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: outFile,
    // three 는 번들에 넣지 않고 node 가 해석하게 둔다 (빠르고, 실제와 같은 인스턴스를 쓴다).
    external: ['three'],
    alias: { '@': './src' },
    logLevel: 'error',
  });

  const { buildWorld } = await import(pathToFileURL(outFile).href);
  const world = buildWorld();

  let calls = 0;
  let triangles = 0;
  let instances = 0;
  const byType = new Map();

  world.scene.traverse((o) => {
    const bump = (k) => byType.set(k, (byType.get(k) ?? 0) + 1);
    if (o.isInstancedMesh) {
      calls++;
      instances += o.count;
      const g = o.geometry;
      triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * o.count;
      bump('InstancedMesh');
    } else if (o.isMesh) {
      calls++;
      const g = o.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      bump('Mesh');
    } else if (o.isLine || o.isLineSegments) {
      calls++;
      bump('Line');
    }
  });

  const BUDGET = 120;
  console.log('── 코드베이스 씬 (src/world/SceneBuilder.ts) ──');
  console.log(`드로우콜   : ${calls}   (예산 <${BUDGET} → ${calls < BUDGET ? '✅ 통과' : '⚠ 초과'})`);
  console.log(`삼각형     : ${(triangles / 1000).toFixed(0)}k`);
  console.log(`인스턴스 총: ${instances.toLocaleString()}`);
  console.log(`열화상 등록: ${world.registry.pairs.length}`);
  console.log(`장애물     : ${world.obstacles.length}`);
  console.log(`구성       : ${[...byType].map(([k, v]) => `${k} ${v}`).join(' / ')}`);

  if (calls >= BUDGET) failed = true;
} catch (err) {
  console.error('❌ 씬 생성 실패:', err.message);
  console.error(err.stack?.split('\n').slice(0, 8).join('\n'));
  failed = true;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
