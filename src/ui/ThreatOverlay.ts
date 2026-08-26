import * as THREE from 'three';
import { undistort } from '@/data/render';
import type { Threat } from '@/mission/threats/Threat';

/**
 * 위협 예고 마커 — GDD 4.5 규칙 1을 **화면에서** 지키는 쪽.
 * 러너가 계약을 강제해도 화면에 안 보이면 플레이어에게는 예고가 없는 것이다.
 *
 * 색 규칙은 `TargetOverlay` 와 같은 04 문서 팔레트를 쓰되 역할이 반대다:
 *   표적 = 녹(지시) / 황(락온),  위협 = 황(경계) / 적(조준).
 * 같은 화면에서 황색이 두 뜻으로 쓰이지 않도록 **위협은 형태로도 구분한다** —
 * 표적은 사각/다이아, 위협은 삼각(조준)과 점선 호(구역).
 *
 * ⚠️ 배럴 왜곡 역변환은 `TargetOverlay` 와 같은 출처를 쓴다 (07 문서 2.4).
 */

const NS = 'http://www.w3.org/2000/svg';
const AMBER = '#FFB347';
const RED = '#FF4D4D';

export class ThreatOverlay {
  private readonly svg: SVGSVGElement;
  private readonly group: SVGGElement;
  private readonly projected = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'threat-overlay');
    this.group = document.createElementNS(NS, 'g');
    this.svg.appendChild(this.group);
    parent.appendChild(this.svg);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private readonly resize = (): void => {
    this.svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  };

  update(threats: readonly Threat[], camera: THREE.Camera, distortion: number): void {
    this.group.innerHTML = '';
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const threat of threats) {
      const tel = threat.telegraph;
      if (!tel) continue;

      this.projected.copy(threat.at);
      this.projected.project(camera);
      if (this.projected.z > 1) continue;

      const [ux, uy] = undistort(this.projected.x * 0.5 + 0.5, -this.projected.y * 0.5 + 0.5, distortion);
      const sx = ux * w;
      const sy = uy * h;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

      if (tel.kind === 'aim') this.drawAim(sx, sy, threat.id, tel.progress);
      else if (tel.kind === 'field') this.drawField(sx, sy, threat.id, tel.progress);
      else this.drawWatch(sx, sy, threat.id, tel.distance);
    }
  }

  /** 조준 중 — 적색 삼각형 + 진행 바. 바가 다 차면 발사다. */
  private drawAim(sx: number, sy: number, id: string, progress: number): void {
    const r = 16;
    this.el('polygon', {
      points: `${sx},${sy - r} ${sx + r * 0.9},${sy + r * 0.7} ${sx - r * 0.9},${sy + r * 0.7}`,
      fill: 'none',
      stroke: RED,
      'stroke-width': '1.6',
    });
    // 진행 바 — 남은 시간이 눈에 보여야 "내 실수"가 된다
    const bw = 34;
    this.line(sx - bw / 2, sy + r + 7, sx + bw / 2, sy + r + 7, RED, 1, 0.35);
    this.line(sx - bw / 2, sy + r + 7, sx - bw / 2 + bw * progress, sy + r + 7, RED, 2.2, 1);
    this.text(sx + r + 6, sy - r + 4, id, RED);
  }

  /** 구역형(재밍) — 점선 호. 실선 원은 04 문서 금지(모든 선은 점선). */
  private drawField(sx: number, sy: number, id: string, strength: number): void {
    const r = 13 + strength * 9;
    this.el('circle', {
      cx: String(sx), cy: String(sy), r: String(r),
      fill: 'none', stroke: AMBER, 'stroke-width': '1.2',
      'stroke-dasharray': '3 4', 'stroke-opacity': String(0.45 + strength * 0.55),
    });
    this.text(sx + r + 6, sy + 4, `${id} ${Math.round(strength * 100)}%`, AMBER);
  }

  /** 존재만 — 황색 짧은 세로선. 아직 위험하지 않다는 것도 정보다. */
  private drawWatch(sx: number, sy: number, id: string, distance: number): void {
    this.line(sx, sy - 9, sx, sy + 9, AMBER, 1.2, 0.75);
    this.text(sx + 6, sy + 4, `${id} ${distance.toFixed(0)}M`, AMBER);
  }

  private el(tag: string, attrs: Record<string, string>): SVGElement {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    this.group.appendChild(e);
    return e;
  }

  private line(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, opacity: number): void {
    this.el('line', {
      x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
      stroke, 'stroke-width': String(width), 'stroke-opacity': String(opacity),
    });
  }

  private text(x: number, y: number, content: string, fill: string): void {
    const t = this.el('text', {
      x: String(x), y: String(y), fill,
      'font-size': '10', 'font-family': 'monospace',
    });
    t.textContent = content;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.svg.remove();
  }
}
