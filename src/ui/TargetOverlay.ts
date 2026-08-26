import * as THREE from 'three';
import { undistort } from '@/data/render';
import type { Target } from '@/world/Targets';

/**
 * 표적 지시 오버레이 — 06 문서 2.1 (실제 드론 영상의 AI 표적 지정 UI).
 *
 * 색 규칙: **녹색 = 원거리 지시/식별**, **황색 = 근거리 락온/교전 준비**.
 * 04 문서 팔레트의 `text.primary`(녹) / `accent.amber`(황) 와 정확히 일치한다.
 *
 * ⚠️ **배럴 왜곡 역변환 필수** (07 문서 2.4).
 * 셰이더가 `uv = 0.5 + c*(1 + k*r²)` 로 화면을 밀기 때문에,
 * 마커도 `0.5 + c*(1 - k*r²)` 로 당겨야 표적 위에 붙는다.
 * **둘 중 하나만 고치면 즉시 어긋난다** — 계수는 반드시 같은 출처(`CAMERA.DISTORT`)를 쓸 것.
 */

/** 이 거리 아래면 락온(황색 박스), 위면 원거리 지시(녹색 사선). */
export const LOCK_RANGE_M = 70;

const NS = 'http://www.w3.org/2000/svg';
const GREEN = '#57D98A';
const AMBER = '#FFB347';

export class TargetOverlay {
  private readonly svg: SVGSVGElement;
  private readonly group: SVGGElement;
  private readonly projected = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'target-overlay');
    this.group = document.createElementNS(NS, 'g');
    this.svg.appendChild(this.group);
    parent.appendChild(this.svg);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private readonly resize = (): void => {
    this.svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  };

  /**
   * @param distortion 셰이더가 **실제로 받은** 왜곡 계수.
   *   상수를 따로 읽으면 튜닝 패널로 값을 바꿨을 때 마커가 조용히 어긋난다.
   */
  update(
    targets: readonly Target[],
    camera: THREE.Camera,
    dronePos: THREE.Vector3,
    distortion: number,
  ): void {
    this.group.innerHTML = '';
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const target of targets) {
      if (!target.alive) continue;

      this.projected.copy(target.group.position);
      this.projected.y = 2.2; // 차체 중간 높이를 겨눈다
      this.projected.project(camera);
      if (this.projected.z > 1) continue; // 카메라 뒤

      // NDC → 0..1 화면 좌표 → **왜곡 역변환** → 픽셀
      const [ux, uy] = undistort(
        this.projected.x * 0.5 + 0.5,
        -this.projected.y * 0.5 + 0.5,
        distortion,
      );
      const sx = ux * w;
      const sy = uy * h;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

      const distance = Math.hypot(
        dronePos.x - target.group.position.x,
        dronePos.y - 2,
        dronePos.z - target.group.position.z,
      );

      if (distance > LOCK_RANGE_M) this.drawDistant(sx, sy, distance);
      else this.drawLock(sx, sy, distance);
    }
  }

  /** 원거리 — 녹색 사선 + 다이아몬드 + 거리 라벨 */
  private drawDistant(sx: number, sy: number, distance: number): void {
    const lx = sx + 58;
    const ly = sy - 34;
    this.line(lx, ly, sx + 9, sy - 5, GREEN, 1.1, 0.9);
    this.line(lx, ly, lx + 34, ly, GREEN, 1.1, 0.9);
    this.el('polygon', {
      points: `${sx},${sy - 6} ${sx + 5},${sy} ${sx},${sy + 6} ${sx - 5},${sy}`,
      fill: 'none',
      stroke: GREEN,
      'stroke-width': '1.2',
    });
    this.text(lx + 38, ly + 4, `TRUCK ${distance.toFixed(0)}M`, GREEN);
  }

  /** 근거리 — 황색 락온 박스 + 내부 십자. 박스가 거리에 따라 커진다. */
  private drawLock(sx: number, sy: number, distance: number): void {
    const size = Math.max(26, Math.min(190, 1500 / Math.max(6, distance)));
    this.el('rect', {
      x: String(sx - size / 2),
      y: String(sy - size / 2),
      width: String(size),
      height: String(size),
      fill: 'none',
      stroke: AMBER,
      'stroke-width': '1.6',
      rx: '2', // 04 문서: 라운드 0~2px 까지만
    });
    this.line(sx - size * 0.18, sy, sx + size * 0.18, sy, AMBER, 1.2, 1);
    this.line(sx, sy - size * 0.18, sx, sy + size * 0.18, AMBER, 1.2, 1);
    this.text(sx + size / 2 + 6, sy - size / 2 + 10, 'LOCK', AMBER);
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
