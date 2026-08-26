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
  /** 가장 급한 위협 예고. 없으면 null (GDD 4.5 규칙 1 — 예고는 반드시 보여야 한다) */
  threat: { token: string; distance: number; armed: boolean; lethal: boolean; aiming: boolean } | null;
  losBlocked: boolean;
  linkDown: boolean;
  /** 자폭 돌입 성립 — 링크 상실이 실패가 아니라 임무 완수라는 표시 */
  struck: boolean;
  /** 작전 구역 경고. 밖이면 카운트다운, 안이면 경계까지 거리 */
  ao: { outside: boolean; secondsLeft: number; distance: number } | null;
  elapsedSec: number;
  build: string;
  /** 미션 목표 — 격파 수/목표 (T8c). null 이면 표기 없음 */
  objective: { kills: number; goal: number } | null;
}

const NS = 'http://www.w3.org/2000/svg';

import { fmt, t } from '@/i18n';

export class Hud {
  private readonly root: HTMLElement;
  private readonly reticle: SVGSVGElement;
  private readonly cells: Record<string, HTMLElement> = {};
  private readonly camButton: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-cell hud-tl" data-c="status"></div>
      <div class="hud-cell hud-tr" data-c="link"></div>
      <div class="hud-cell hud-mr" data-c="alt"></div>
      <div class="hud-cell hud-bl" data-c="callsign"></div>
      <div class="hud-cell hud-br" data-c="build"></div>
      <button class="hud-btn" data-c="cam">${t('ui.cam.cycle')}</button>
    `;
    parent.appendChild(this.root);
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-c]')) {
      this.cells[el.dataset.c!] = el;
    }

    this.camButton = this.root.querySelector('[data-c="cam"]')!;

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

  /** 카메라 모드 전환 진입점. 폰에는 키보드가 없으니 화면에 버튼이 있어야 한다. */
  onCamCycle(handler: () => void): void {
    this.camButton.addEventListener('click', handler);
  }

  update(s: HudState): void {
    const volts = (14.0 + 2.8 * (s.batteryPercent / 100)).toFixed(1);
    // 30% 이하는 저전압 경고 깜빡임 (GDD 4장)
    const lowBattery = s.batteryPercent <= 30;
    const battClass = lowBattery ? (Math.floor(performance.now() / 400) % 2 ? 'red' : 'dim') : 'wht';
    // 같은 정지 화면이라도 자폭은 실패가 아니다 — 무전은 "잘 가라, 고철"이라고 한다
    const status = s.linkDown ? (s.struck ? 'TGT DOWN' : 'NO LINK') : s.losBlocked ? 'LOS BLOCK' : 'READY';

    /**
     * 위협 예고 — 06 문서 원칙 ⑤: 라벨 없이 코드와 거리만.
     *
     * 적색은 **죽는 위협이 실제로 겨누고 있을 때만** 쓴다.
     * 재밍처럼 죽이지 않는 위협을 적색으로 띄우면 진짜 적색이 안 읽힌다.
     */
    const threatClass = !s.threat
      ? ''
      : s.threat.lethal && s.threat.aiming
        ? s.threat.armed && Math.floor(performance.now() / 200) % 2
          ? 'red'
          : s.threat.armed
            ? 'dim'
            : 'red'
        : 'amb';
    const threat = s.threat
      ? `<br><span class="${threatClass}">${s.threat.token} ${s.threat.distance.toFixed(0)}M</span>`
      : '';

    // 작전 구역 — 이탈 중엔 적색 카운트다운(지금 가장 급한 숫자), 접근 중엔 황색 거리
    const ao = s.ao
      ? `<br><span class="${
          s.ao.outside ? (Math.floor(performance.now() / 250) % 2 ? 'red' : 'dim') : 'amb'
        }">${s.ao.outside ? `RTB ${s.ao.secondsLeft}` : `AO ${s.ao.distance.toFixed(0)}M`}</span>`
      : '';

    this.cells.status.innerHTML =
      `<span class="wht">${status}</span><br>` +
      `<span class="wht">AIR</span><br>` +
      `<span class="${battClass}">${volts}V</span>` +
      threat +
      ao;

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

    this.cells.callsign.innerHTML =
      `<span class="dim">ROOKIE</span>` +
      (s.objective
        ? `<br><span class="${s.objective.kills >= s.objective.goal ? 'amb' : 'wht'}">${fmt(
            'hud.objective',
            s.objective.kills,
            s.objective.goal,
          )}</span>`
        : '');
    this.cells.build.innerHTML =
      `<span class="dim">SIG ${(s.signal * 100).toFixed(0)}%</span><br>` +
      `<span class="${s.burst > 0.3 ? 'red' : 'dim'}">${s.burst > 0.3 ? 'DEGRADED' : 'STABLE'}</span><br>` +
      `<span class="dim small">${s.build}</span>`;
  }

  /** 무전 한 줄 — 하단 중앙 3.2초 (03 문서 4장 "화면 하단 1줄" 연출). */
  radio(text: string): void {
    let el = this.root.querySelector<HTMLElement>('.hud-radio');
    if (!el) {
      el = document.createElement('div');
      el.className = 'hud-radio';
      this.root.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    // reflow 로 트랜지션 재시작
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(this.radioTimer);
    this.radioTimer = window.setTimeout(() => el?.classList.remove('show'), 3200);
  }
  private radioTimer = 0;

  dispose(): void {
    window.clearTimeout(this.radioTimer);
    window.removeEventListener('resize', this.buildReticle);
    this.root.remove();
  }
}
