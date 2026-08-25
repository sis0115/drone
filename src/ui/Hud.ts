import { t } from '@/i18n';

/**
 * HUD는 캔버스 밖 DOM/SVG 오버레이다 — 480p 업스케일에 뭉개지지 않고 선명하게 남는다
 * (02 문서 1장). T1은 링크 상태와 fps만 띄운다. 점선 십자·표적 오버레이는 T5.
 */
export class Hud {
  private readonly fpsEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly modeEl: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <div class="hud-corner hud-tl" data-role="status">--</div>
      <div class="hud-corner hud-tr" data-role="fps">-- FPS</div>
      <div class="hud-corner hud-bl" data-role="mode">ARCADE</div>
      <button class="hud-btn" data-role="cloud">${t('ui.cloud.open')}</button>
      <div class="hud-corner hud-br">${__BUILD_BRANCH__} ${__BUILD_ID__}</div>
    `;
    this.fpsEl = this.root.querySelector('[data-role="fps"]')!;
    this.statusEl = this.root.querySelector('[data-role="status"]')!;
    this.modeEl = this.root.querySelector('[data-role="mode"]')!;
  }

  /** 클라우드 패널 진입점. 폰에는 콘솔이 없으니 화면에 버튼이 있어야 한다. */
  onCloudClick(handler: () => void): void {
    this.root.querySelector('[data-role="cloud"]')!.addEventListener('click', handler);
  }

  setMode(mode: string): void {
    // 모드명은 산문이 아니라 기술 토큰이라 i18n 대상이 아니다.
    this.modeEl.textContent = mode.toUpperCase();
  }

  update(fps: number, signalQuality: number): void {
    this.fpsEl.textContent = `${fps} FPS`;
    // 45fps 미만은 예산 미달 — 실기에서 바로 보이도록 색으로 경고한다 (02 문서 5장).
    this.fpsEl.dataset.warn = fps > 0 && fps < 45 ? '1' : '0';
    this.statusEl.textContent = `RSSI ${Math.round(signalQuality * 100)}%`;
  }
}
