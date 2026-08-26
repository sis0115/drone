// 프로토타입 v0.7 을 `/prototype.html` 로 내보낸다 (기준선 참조용).
//
// prototype/signal_lost_fpv.html 은 기준선이라 **수정 금지**(07 문서)다.
// 그래서 원본을 건드리지 않고 public/ 으로 그대로 복사한다 —
// public/ 은 Vite 가 가공 없이 dist 로 옮기므로 단일 HTML + CDN 구조가 보존된다.
//
// T2 이식이 끝나 사이트 루트는 코드베이스가 가져갔다. 프로토타입은 비교용 기준선으로만 남는다
// (`npm run compare` 가 이걸 쓴다).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'prototype', 'signal_lost_fpv.html');
const outDir = path.join(__dirname, '..', 'public');
const out = path.join(outDir, 'prototype.html');

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, out);

const bytes = fs.statSync(out).size;
console.log(`데모 동기화: prototype/signal_lost_fpv.html → public/prototype.html (${(bytes / 1024).toFixed(0)}KB)`);
