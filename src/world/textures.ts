import * as THREE from 'three';
import { fbm, hash2 } from './noise';

/**
 * 프로시저럴 텍스처. **에셋 파일 도입 금지 원칙**(02 문서 1장)의 실체 —
 * 전부 캔버스에 그려서 만든다. 계수는 프로토타입 v0.7 그대로.
 */

/**
 * 지면 팔레트 — 아트 패스 1 (DEVLOG 2026-08-26).
 * 프로토타입의 금빛↔올리브 대비는 건강한 농촌으로 읽혔다. 전장 영상의 지면은
 * 계절이 죽어 있다 — 마른 쪽은 회갈, 녹색 쪽은 채도 빠진 올리브. 둘의 거리도 좁힌다.
 */
const DRY = [151, 138, 105];
const GRN = [88, 93, 60];
const DRY2 = [172, 158, 122];
const GRN2 = [66, 76, 46];

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
  // 구조 주파수는 512 기준으로 정규화 — 해상도를 올려도 무늬의 월드 크기는 같고
  // 픽셀 그레인(fine)만 세밀해진다 (아트 패스 3: "같은 무늬, 더 선명하게").
  const q = 512 / sz;
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const patch = fbm(i * q * 0.01, j * q * 0.01, 3); // 저주파: 마른/녹색 구역
      const det = fbm(i * q * 0.16, j * q * 0.16, 4); // 중주파: 덤불 덩어리
      const fine = hash2(i * 3.1, j * 2.7); // 고주파: 잎 알갱이
      const t = Math.max(0, Math.min(1, (patch - 0.38) * 3.2));
      let r = DRY[0] * (1 - t) + GRN[0] * t;
      let g = DRY[1] * (1 - t) + GRN[1] * t;
      let b = DRY[2] * (1 - t) + GRN[2] * t;
      /**
       * 경작지 패치워크 — 항공에서 이 땅을 "농지"로 읽게 하는 것은 필지 경계다.
       * 저주파 노이즈를 계단화해 필지마다 명도를 살짝 다르게, 경계에는 어두운 골(농로/도랑).
       */
      const field = fbm(i * q * 0.006 + 77, j * q * 0.006 + 77, 2);
      const cell = Math.floor(field * 7);
      const fieldTone = 0.9 + (hash2(cell * 13.7, cell * 7.1) - 0.5) * 0.22;
      r *= fieldTone;
      g *= fieldTone;
      b *= fieldTone;
      const boundary = Math.abs(field * 7 - cell - 0.5);
      if (boundary > 0.46) {
        r *= 0.72;
        g *= 0.72;
        b *= 0.7;
      }
      // 쟁기 이랑 — 일부 필지에만, 한 방향 줄무늬. 있는 밭과 없는 밭이 섞여야 산다
      if (hash2(cell * 3.3, 9.1) > 0.5) {
        const rowDir = (hash2(cell * 5.9, 1.7) > 0.5 ? i + j * 0.35 : j - i * 0.28) * q;
        const row = Math.sin(rowDir * 0.55) * 0.5 + 0.5;
        const amp = 1 + (row - 0.5) * 0.12;
        r *= amp;
        g *= amp;
        b *= amp;
      }
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

/**
 * 아스팔트 — 낡은 2차선의 문법을 픽셀 단계에서 전부 넣는다:
 * 타이어 마모대(차로당 2줄) · 바랜 중앙 점선 · 보수 패치 · 크랙 망 · 포트홀 · 가장자리 침식.
 * 480p 에서 도로를 "도로"로 읽게 하는 것은 지오메트리가 아니라 이 명암 패턴이다.
 */
export function roadTex(sz: number): THREE.CanvasTexture {
  const { c, x } = canvas(sz, sz);
  const img = x.createImageData(sz, sz);
  const d = img.data;
  const q = 256 / sz; // 구조 주파수 정규화 (기준 256) — 무늬 월드 크기 불변
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const n = hash2(i * 1.7, j * 1.3);
      const f = fbm(i * q * 0.05, j * q * 0.05, 3);
      const u = i / sz; // 0(좌측 갓길) ~ 1(우측 갓길)
      let v = 116 + (f - 0.5) * 40 + (n - 0.5) * 24;

      // 타이어 마모대 — 아스팔트에서 가장 먼저 생기는 무늬. 차로당 2줄, 완만한 골.
      for (const lane of [0.3, 0.7]) {
        for (const off of [-0.085, 0.085]) {
          const t = Math.abs(u - (lane + off)) / 0.05;
          if (t < 1) v -= (1 - t * t) * 16;
        }
      }
      // 보수 패치 — 진하고 매끈한 직사각 구획 (저주파 노이즈로 자리를 정한다)
      const patch = fbm(i * q * 0.02 + 40, j * q * 0.008 + 40, 2);
      if (patch > 0.62) v = v * 0.55 + 26;
      // 크랙 망 — fbm 등고선의 능선만 얇게 어둡힌다
      const crack = fbm(i * q * 0.11, j * q * 0.09, 4);
      if (Math.abs(crack - 0.5) < 0.012) v -= 34;
      // 포트홀 — 아주 드문 검은 점
      if (hash2(i * q * 0.31, j * q * 0.27) > 0.9965) v -= 60;

      const edge = Math.min(i, sz - 1 - i) / (sz * 0.5);
      if (edge < 0.13) v -= (0.13 - edge) * 250; // 가장자리 흙 침식
      if (n > 0.988) v += 42; // 자갈 반짝임

      let r = v * 1.02;
      let g = v;
      let b = v * 0.96;
      // 바랜 중앙 점선 — 세로(j) 12px 주기 중 7px 만 칠하고, 닳아서 끊긴다
      if (Math.abs(u - 0.5) < 0.014 && Math.floor(j * q) % 12 < 7 && hash2(Math.floor(j * q) * 0.7, 3.1) > 0.3) {
        const paint = 150 + (n - 0.5) * 40;
        r = Math.max(r, paint);
        g = Math.max(g, paint * 0.97);
        b = Math.max(b, paint * 0.82);
      }
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

export function dirtTex(sz: number): THREE.CanvasTexture {
  const { c, x } = canvas(sz, sz);
  const img = x.createImageData(sz, sz);
  const d = img.data;
  const q = 256 / sz; // 구조 주파수 정규화
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sz; i++) {
      const k = (j * sz + i) * 4;
      const n = hash2(i * 2.1, j * 1.9);
      const f = fbm(i * q * 0.06, j * q * 0.06, 3);
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
    const r = dry ? 138 + Math.random() * 46 : 74 + Math.random() * 40;
    const g = dry ? 126 + Math.random() * 40 : 92 + Math.random() * 42;
    const b = dry ? 88 + Math.random() * 34 : 52 + Math.random() * 28;
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

/** 연기 기둥 — 세로로 찢긴 반투명 뭉게 알파. 원경 전용이라 128px 로 충분하다. */
export function smokeTex(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const { c, x } = canvas(w, h);
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const n = fbm(i * 0.09, j * 0.045, 4);
      // 위로 갈수록 옅어지고, 좌우 가장자리가 찢어진다
      const edge = Math.sin((i / w) * Math.PI);
      const rise = 1 - j / h;
      const a = Math.max(0, (n - 0.34) * 2.2) * edge * (0.35 + rise * 0.65);
      const v = 120 + n * 90;
      d[k] = v;
      d[k + 1] = v;
      d[k + 2] = v * 0.98;
      d[k + 3] = Math.min(255, a * 255);
    }
  x.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = THREE.RepeatWrapping;
  return tx;
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
  // 기초띠 — 벽 아래 어두운 콘크리트 굽. 건물이 땅에 "박혀" 보이게 하는 한 줄이다.
  x.fillStyle = 'rgba(70,66,58,0.85)';
  x.fillRect(0, sz - 7, sz, 7);
  x.fillStyle = 'rgba(58,54,48,0.5)';
  x.fillRect(0, sz - 9, sz, 2);
  // 처마 그늘 — 위쪽 어두운 띠. 지붕이 벽에 그림자를 떨군다.
  const eave = x.createLinearGradient(0, 0, 0, 9);
  eave.addColorStop(0, 'rgba(30,28,24,0.55)');
  eave.addColorStop(1, 'rgba(30,28,24,0)');
  x.fillStyle = eave;
  x.fillRect(0, 0, sz, 9);

  const mw = sz / (cols + 1);
  const mh = sz / (rows + 1);
  // 문 — 창 하나 자리를 문으로 바꾼다 (기초띠까지 내려온다)
  const doorCol = (Math.random() * cols) | 0;
  for (let r = 0; r < rows; r++)
    for (let cc = 0; cc < cols; cc++) {
      const wx = mw * (cc + 0.62);
      const isDoor = r === rows - 1 && cc === doorCol;
      if (isDoor) {
        const dw = mw * 0.5;
        const dh = mh * 1.1;
        const dy = sz - 7 - dh;
        x.fillStyle = '#2e2a22';
        x.fillRect(wx, dy, dw, dh);
        x.strokeStyle = '#57503f';
        x.lineWidth = 1.4;
        x.strokeRect(wx, dy, dw, dh);
        // 문 위 인방
        x.fillStyle = 'rgba(120,112,96,0.9)';
        x.fillRect(wx - 1.5, dy - 2.5, dw + 3, 2.5);
        continue;
      }
      const wy = mh * (r + 0.55);
      const ww = mw * 0.62;
      const wh = mh * 0.66;
      // 창 개구부 — 위쪽에 하늘 반사, 아래로 갈수록 검다
      const glass = x.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, '#4a565c');
      glass.addColorStop(0.45, '#232a2e');
      glass.addColorStop(1, '#181d20');
      x.fillStyle = glass;
      x.fillRect(wx, wy, ww, wh);
      x.strokeStyle = '#cfc9ba';
      x.lineWidth = 1.6;
      x.strokeRect(wx, wy, ww, wh);
      x.beginPath();
      x.moveTo(wx + ww / 2, wy);
      x.lineTo(wx + ww / 2, wy + wh);
      x.stroke();
      // 창턱 — 아래로 살짝 넓은 밝은 돌출 + 그 밑 때 얼룩
      x.fillStyle = 'rgba(205,198,182,0.95)';
      x.fillRect(wx - 1.5, wy + wh, ww + 3, 2);
      x.fillStyle = 'rgba(80,74,62,0.25)';
      x.fillRect(wx - 1, wy + wh + 2, ww + 2, 5);
      // 인방 — 창 위 가로 부재
      x.fillStyle = 'rgba(150,142,124,0.8)';
      x.fillRect(wx - 1.5, wy - 2.2, ww + 3, 2.2);
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
        let v = 96 + rib * 54 + (Math.random() - 0.5) * 16;
        // 판 이음매 — 16px 마다 어두운 골. 함석 지붕은 "판"으로 읽혀야 한다
        if (i % 16 < 1.5) v -= 30;
        r = v * 0.92;
        g = v * 0.95;
        b = v * 0.9;
        // 녹 얼룩 — 이음매·아래쪽에서 번진다
        const rust = hash2(i * 0.9, j * 0.7);
        if (rust > 0.86 && (i % 16 < 3 || j > sz * 0.6)) {
          const k2 = (rust - 0.86) * 6;
          r = r * (1 - k2) + 122 * k2;
          g = g * (1 - k2) + 74 * k2;
          b = b * (1 - k2) + 48 * k2;
        }
      } else {
        const row = Math.floor(j / 8) % 2;
        const tile = (i + row * 4) % 8;
        // 기와 한 장 안에서도 아래로 갈수록 어둡다 — 겹침 그늘
        const inRow = (j % 8) / 8;
        let v = (tile < 1 ? 0.66 : 1) * (118 + (Math.random() - 0.5) * 22) * (1.06 - inRow * 0.18);
        // 장마다 미묘한 색 편차 — 갈아 끼운 기와
        const tileId = Math.floor(i / 8) * 31 + Math.floor(j / 8) * 17;
        v *= 0.92 + hash2(tileId, 3.7) * 0.16;
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
