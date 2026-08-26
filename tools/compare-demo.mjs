// 코드베이스(/app.html)와 프로토타입 데모를 **같은 조건에서 나란히 렌더**해 비교한다.
//
// T2 완료 조건이 "프로토타입과 동일 화면"인데, 눈대중으로는 이식 누락을 못 잡는다.
// 이 도구가 실제로 잡아낸 것: 조명 색·강도, 안개 거리, 카메라 near/far, 그림자 맵 크기.
// (T1 에서 프로토타입을 읽지 않고 추정한 값들이 전부 틀려 있었다.)
//
// 프로토타입은 three r128 을 CDN 에서 받으므로, 오프라인 비교를 위해
// 최초 1회만 내려받아 node_modules/.slfpv-ref 에 캐시한다.
//
// 사용: npm run preview 를 띄운 뒤  node tools/compare-demo.mjs
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium, devices } from '@playwright/test';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const CACHE = join(process.cwd(), 'node_modules', '.slfpv-ref');
const OUT = join(process.cwd(), 'tests', '__screenshots__');
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173/';
const PORT = 8899;

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ── 프로토타입을 오프라인으로 띄울 수 있게 준비 ──
const threePath = join(CACHE, 'three.min.js');
if (!existsSync(threePath)) {
  process.stdout.write('three r128 내려받는 중… ');
  const res = await fetch(THREE_URL);
  if (!res.ok) {
    console.error(`실패 (HTTP ${res.status}). 네트워크가 막힌 환경이면 비교를 건너뛴다.`);
    process.exit(0);
  }
  writeFileSync(threePath, Buffer.from(await res.arrayBuffer()));
  console.log('완료');
}
const demoHtml = readFileSync('prototype/signal_lost_fpv.html', 'utf8').replace(THREE_URL, './three.min.js');
writeFileSync(join(CACHE, 'demo.html'), demoHtml);

const server = createServer((req, res) => {
  const name = (req.url ?? '/').split('?')[0] === '/three.min.js' ? 'three.min.js' : 'demo.html';
  res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(readFileSync(join(CACHE, name)));
}).listen(PORT);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH
    ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
});

async function shoot(url, file, prepare) {
  // **가로 고정** — GDD 7장. 세로로 재면 16:9 렌더가 늘어나 비교가 무의미해진다.
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await prepare(page);
  await page.screenshot({ path: join(OUT, file) });
  await ctx.close();
  return errors;
}

try {
  const protoErrors = await shoot(`http://127.0.0.1:${PORT}/demo.html`, 'compare-prototype.png', async (page) => {
    await page.waitForTimeout(1500);
    await page.click('#go');
    await page.waitForTimeout(9000); // 아케이드 자동 고도(18m)까지 올라갈 시간
  });
  const appErrors = await shoot(APP_URL, 'compare-codebase.png', async (page) => {
    await page.waitForFunction(() => window.__debug?.ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(8000);
  });

  console.log('스크린샷 2장 저장:');
  console.log(`  ${join(OUT, 'compare-prototype.png')}  (기준선)`);
  console.log(`  ${join(OUT, 'compare-codebase.png')}   (코드베이스)`);
  if (protoErrors.length) console.log('프로토타입 오류:', protoErrors);
  if (appErrors.length) console.log('코드베이스 오류:', appErrors);
  console.log('\n※ 두 장을 눈으로 비교할 것. 자동 픽셀 비교는 하지 않는다 —');
  console.log('  씬 배치가 Math.random() 기반이라 실행마다 달라지기 때문.');
} finally {
  server.close();
  await browser.close();
}
