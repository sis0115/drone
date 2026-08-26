/**
 * HUD — 06 문서 2장의 실측 규격.
 *
 * 캔버스 밖 DOM/SVG 라 480p 업스케일에 뭉개지지 않는다 (02 문서 1장).
 * 06 문서가 실제 드론 영상에서 뽑은 5원칙을 따른다:
 *   ① 모든 선은 점선 — 실선 프레임 없음
 *   ② 텍스트는 코너에 흩어진다 (좌상 상태 / 우상 모드·신호 / 우중하 고도 / 좌하 콜사인)
 *   ③ 배경판·테두리 상자 없음. 텍스트에 얇은 검정 외곽선만
 *   ④ 코너 브래킷으로 아이콘을 감싼다
 *   ⑤ 수치는 라벨 없이 숫자만 나열되기도 — 정보 밀도보다 "실기 느낌" 우선
 */
export interface HudState {
  fps: number;
  signal: number;
  /** 발작적 붕괴 강도 — DEGRADED 표시 기준 */
  burst: number;
  batteryPercent: number;
  altitude: number;
  /** km/h */
  speed: number;
  /** 아케이드의 목표 고도. 프로 모드면 null */
  targetAltitude: number | null;
  camMode: string;
  losBlocked: boolean;
  linkDown: boolean;
  elapsedSec: number;
  build: string;
}

const NS = 'http://www.w3.org/2000/svg';

export class Hud {
  private readonly root: HTMLElement;
  private readonly reticle: SVGSVGElement;
  private readonly cells: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-cell hud-tl" data-c="status"></div>
      <div class="hud-cell hud-tr" data-c="link"></div>
      <div class="hud-cell hud-mr" data-c="alt"></div>
      <div class="hud-cell hud-bl" data-c="callsign"></div>
      <div class="hud-cell hud-br" data-c="build"></div>
    `;
    parent.appendChild(this.root);
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-c]')) {
      this.cells[el.dataset.c!] = el;
    }

    this.reticle = document.createElementNS(NS, 'svg');
    this.reticle.setAttribute('class', 'hud-reticle');
    this.root.insertBefore(this.reticle, this.root.firstChild);
    this.buildReticle();
    window.addEventListener('resize', this.buildReticle);
  }

  /**
   * 점선 십자 + 수평 가이드.
   * ⚠️ 중앙 고정이라 배럴 왜곡의 영향을 받지 않는다(화면 중심은 왜곡이 0).
   * 표적 마커는 다르다 — `TargetOverlay` 가 역변환을 적용한다.
   */
  private readonly buildReticle = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.reticle.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.reticle.innerHTML = '';

    const cx = w / 2;
    const cy = h / 2;
    const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean, width: number, opacity: number) => {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', String(x1));
      el.setAttribute('y1', String(y1));
      el.setAttribute('x2', String(x2));
      el.setAttribute('y2', String(y2));
      el.setAttribute('stroke', '#D8E4DA');
      el.setAttribute('stroke-width', String(width));
      el.setAttribute('stroke-opacity', String(opacity));
      if (dashed) el.setAttribute('stroke-dasharray', '7 9');
      this.reticle.appendChild(el);
    };

    // 수평 가이드 — 가운데를 비워 시야를 막지 않는다
    line(w * 0.17, cy, w * 0.4, cy, true, 1.2, 0.5);
    line(w * 0.6, cy, w * 0.83, cy, true, 1.2, 0.5);

    // 중앙 십자도 4조각 — 실선 십자가 아니다
    const gap = 16;
    const len = 13;
    line(cx - gap - len, cy, cx - gap, cy, false, 1.4, 0.7);
    line(cx + gap, cy, cx + gap + len, cy, false, 1.4, 0.7);
    line(cx, cy - gap - len, cx, cy - gap, false, 1.4, 0.7);
    line(cx, cy + gap, cx, cy + gap + len, false, 1.4, 0.7);
  };

  update(s: HudState): void {
    const volts = (14.0 + 2.8 * (s.batteryPercent / 100)).toFixed(1);
    // 30% 이하는 저전압 경고 깜빡임 (GDD 4장)
    const lowBattery = s.batteryPercent <= 30;
    const battClass = lowBattery ? (Math.floor(performance.now() / 400) % 2 ? 'red' : 'dim') : 'wht';
    const status = s.linkDown ? 'NO LINK' : s.losBlocked ? 'LOS BLOCK' : 'READY';

    this.cells.status.innerHTML =
      `<span class="wht">${status}</span><br>` +
      `<span class="wht">AIR</span><br>` +
      `<span class="${battClass}">${volts}V</span>`;

    // 신호 막대 — 라벨 없이 기호만 (06 문서 원칙 ⑤)
    const bars = '▂▄▆█'.slice(0, Math.round(s.signal * 4)) || '·';
    const mm = String(Math.floor(s.elapsedSec / 60)).padStart(2, '0');
    const ss = String(Math.floor(s.elapsedSec % 60)).padStart(2, '0');
    this.cells.link.innerHTML =
      `<span class="brk">${s.camMode}</span><span class="brk">${bars}</span><br>` +
      `<span class="dim small">${mm}:${ss} · ${s.fps < 10 ? s.fps.toFixed(1) : Math.round(s.fps)}fps</span>`;

    this.cells.alt.innerHTML =
      `<span class="wht">ALT ${s.altitude.toFixed(0)}m</span><br>` +
      `<span class="dim">${s.speed.toFixed(0)}km/h</span>` +
      (s.targetAltitude !== null ? `<br><span class="amb small">SET ${s.targetAltitude.toFixed(0)}m</span>` : '');

    this.cells.callsign.innerHTML = `<span class="dim">ROOKIE</span>`;
    this.cells.build.innerHTML =
      `<span class="dim">SIG ${(s.signal * 100).toFixed(0)}%</span><br>` +
      `<span class="${s.burst > 0.3 ? 'red' : 'dim'}">${s.burst > 0.3 ? 'DEGRADED' : 'STABLE'}</span><br>` +
      `<span class="dim small">${s.build}</span>`;
  }

  dispose(): void {
    window.removeEventListener('resize', this.buildReticle);
    this.root.remove();
  }
}
