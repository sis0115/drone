import * as THREE from 'three';
import { fbm, hash2 } from './noise';

/**
 * 프로시저럴 텍스처. **에셋 파일 도입 금지 원칙**(02 문서 1장)의 실체 —
 * 전부 캔버스에 그려서 만든다. 계수는 프로토타입 v0.7 그대로.
 */

/** 지면 팔레트: 마른 금빛 ↔ 올리브 녹색 (06 문서 레퍼런스) */
const DRY = [172, 150, 96];
const GRN = [86, 108, 54];
const DRY2 = [196, 178, 124];
const GRN2 = [62, 84, 42];

function canvas(w: number, h: number): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, x: c.getContext('2d') as CanvasRenderingContext2D };
}

export function groundTex(sz: number): THREE.CanvasTexture {
  const { c, x } = canvas(sz, sz);
  const img = x.createImageData(sz, sz);
  const d = img.data;
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const patch = fbm(i * 0.01, j * 0.01, 3); // 저주파: 마른/녹색 구역
      const det = fbm(i * 0.16, j * 0.16, 4); // 중주파: 덤불 덩어리
      const fine = hash2(i * 3.1, j * 2.7); // 고주파: 잎 알갱이
      const t = Math.max(0, Math.min(1, (patch - 0.38) * 3.2));
      let r = DRY[0] * (1 - t) + GRN[0] * t;
      let g = DRY[1] * (1 - t) + GRN[1] * t;
      let b = DRY[2] * (1 - t) + GRN[2] * t;
      const hi = (det - 0.5) * 0.55 + (fine - 0.5) * 0.42; // 밝기 요동
      r *= 1 + hi;
      g *= 1 + hi * 1.05;
      b *= 1 + hi * 0.85;
      if (fine > 0.972) [r, g, b] = DRY2; // 마른 줄기 하이라이트
      if (fine < 0.028) [r, g, b] = [GRN2[0] * 0.8, GRN2[1] * 0.8, GRN2[2] * 0.8]; // 잎 그늘
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  return tx;
}

/** 아스팔트 — 갈라짐 + 가장자리 침식 */
export function roadTex(sz: number): THREE.CanvasTexture {
  const { c, x } = canvas(sz, sz);
  const img = x.createImageData(sz, sz);
  const d = img.data;
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const n = hash2(i * 1.7, j * 1.3);
      const f = fbm(i * 0.05, j * 0.05, 3);
      let v = 118 + (f - 0.5) * 46 + (n - 0.5) * 26;
      const edge = Math.min(i, sz - 1 - i) / (sz * 0.5);
      if (edge < 0.13) v -= (0.13 - edge) * 250; // 가장자리 흙 침식
      if (n > 0.988) v += 42;
      d[k] = v * 1.02;
      d[k + 1] = v;
      d[k + 2] = v * 0.96;
      d[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  return tx;
}

export function dirtTex(sz: number): THREE.CanvasTexture {
  const { c, x } = canvas(sz, sz);
  const img = x.createImageData(sz, sz);
  const d = img.data;
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const n = hash2(i * 2.1, j * 1.9);
      const f = fbm(i * 0.06, j * 0.06, 3);
      let r = 150 + (f - 0.5) * 54 + (n - 0.5) * 30;
      let g = 124 + (f - 0.5) * 46 + (n - 0.5) * 26;
      let b = 92 + (f - 0.5) * 38 + (n - 0.5) * 22;
      const u = i / sz;
      if (Math.abs(u - 0.3) < 0.05 || Math.abs(u - 0.7) < 0.05) {
        r -= 34; // 바퀴자국
        g -= 30;
        b -= 24;
      }
      if (n > 0.978) {
        r = 178; // 자갈
        g = 172;
        b = 160;
      }
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

/** 풀포기 빌보드 (알파) — 잎사귀를 직접 그린다 */
export function grassTex(): THREE.CanvasTexture {
  const w = 96;
  const h = 96;
  const { c, x } = canvas(w, h);
  x.clearRect(0, 0, w, h);
  for (let i = 0; i < 54; i++) {
    const bx = 6 + Math.random() * 84;
    const len = 22 + Math.random() * 66;
    const lean = (Math.random() - 0.5) * 30;
    const dry = Math.random() < 0.42;
    const r = dry ? 150 + Math.random() * 60 : 70 + Math.random() * 50;
    const g = dry ? 138 + Math.random() * 50 : 105 + Math.random() * 55;
    const b = dry ? 76 + Math.random() * 40 : 44 + Math.random() * 32;
    x.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.55 + Math.random() * 0.45})`;
    x.lineWidth = 0.8 + Math.random() * 2.0;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(bx, h);
    x.quadraticCurveTo(bx + lean * 0.45, h - len * 0.6, bx + lean, h - len);
    x.stroke();
    if (dry && Math.random() < 0.3) {
      // 이삭
      x.fillStyle = `rgba(${(r + 20) | 0},${(g + 16) | 0},${(b + 10) | 0},0.85)`;
      x.beginPath();
      x.ellipse(bx + lean, h - len, 1.6, 4.2, lean * 0.02, 0, 6.28);
      x.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

/** 벽 — 스투코 + 창문 격자 */
export function wallTex(rows: number, cols: number): THREE.CanvasTexture {
  const sz = 128;
  const { c, x } = canvas(sz, sz);
  const base = 190 + Math.random() * 40;
  x.fillStyle = `rgb(${base | 0},${(base - 8) | 0},${(base - 26) | 0})`;
  x.fillRect(0, 0, sz, sz);
  for (let i = 0; i < 900; i++) {
    const v = (Math.random() - 0.5) * 46;
    x.fillStyle = `rgba(${(base + v) | 0},${(base + v - 8) | 0},${(base + v - 26) | 0},0.5)`;
    x.fillRect(Math.random() * sz, Math.random() * sz, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  for (let i = 0; i < 40; i++) {
    // 빗물자국
    x.fillStyle = 'rgba(90,84,70,0.10)';
    x.fillRect(Math.random() * sz, sz * 0.55 + Math.random() * sz * 0.45, 1 + Math.random() * 3, 10 + Math.random() * 30);
  }
  const mw = sz / (cols + 1);
  const mh = sz / (rows + 1);
  for (let r = 0; r < rows; r++)
    for (let cc = 0; cc < cols; cc++) {
      const wx = mw * (cc + 0.62);
      const wy = mh * (r + 0.55);
      const ww = mw * 0.62;
      const wh = mh * 0.66;
      x.fillStyle = '#20262a';
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(150,175,190,0.28)';
      x.fillRect(wx, wy, ww, wh * 0.42);
      x.strokeStyle = '#d8d2c4';
      x.lineWidth = 1.6;
      x.strokeRect(wx, wy, ww, wh);
      x.beginPath();
      x.moveTo(wx + ww / 2, wy);
      x.lineTo(wx + ww / 2, wy + wh);
      x.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 지붕 — 골함석(metal) / 기와 */
export function roofTex(metal: boolean): THREE.CanvasTexture {
  const sz = 64;
  const { c, x } = canvas(sz, sz);
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      let r: number, g: number, b: number;
      if (metal) {
        const rib = Math.sin(i * 0.9) * 0.5 + 0.5;
        const v = 96 + rib * 54 + (Math.random() - 0.5) * 16;
        r = v * 0.92;
        g = v * 0.95;
        b = v * 0.9;
      } else {
        const row = Math.floor(j / 8) % 2;
        const tile = (i + row * 4) % 8;
        const v = (tile < 1 ? 0.72 : 1) * (120 + (Math.random() - 0.5) * 22);
        r = v * 1.32;
        g = v * 0.72;
        b = v * 0.56;
      }
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(i, j, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** 접지 그늘 (AO 패치) */
export function aoTex(): THREE.CanvasTexture {
  const sz = 64;
  const { c, x } = canvas(sz, sz);
  const g = x.createRadialGradient(sz / 2, sz / 2, 1, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, sz, sz);
  return new THREE.CanvasTexture(c);
}

export function texMat(t: THREE.Texture, color?: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: t, color: color ?? 0xffffff });
}
