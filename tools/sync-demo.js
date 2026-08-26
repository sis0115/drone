// 프로토타입 v0.7 을 사이트 루트(`/`)로 내보낸다.
//
// prototype/signal_lost_fpv.html 은 기준선이라 **수정 금지**(07 문서)다.
// 그래서 원본을 건드리지 않고 public/ 으로 그대로 복사한다 —
// public/ 은 Vite 가 가공 없이 dist 로 옮기므로 단일 HTML + CDN 구조가 보존된다.
//
// T2 에서 프로토타입을 코드베이스로 이식하고 나면 이 스크립트는 사라진다.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'prototype', 'signal_lost_fpv.html');
const outDir = path.join(__dirname, '..', 'public');
const out = path.join(outDir, 'index.html');

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, out);

const bytes = fs.statSync(out).size;
console.log(`데모 동기화: prototype/signal_lost_fpv.html → public/index.html (${(bytes / 1024).toFixed(0)}KB)`);
