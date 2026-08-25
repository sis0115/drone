import { t } from '@/i18n';

/** 인게임 진입 로딩을 연출로 소화한다 — 검은 화면 + LINK ESTABLISHING + RSSI 게이지 (04 문서 2장). */
export class BootScreen {
  private readonly bar: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <div class="boot-line">${t('ui.osd.link_establishing')}</div>
      <div class="boot-gauge"><span data-role="bar"></span></div>
    `;
    this.bar = this.root.querySelector('[data-role="bar"]')!;
  }

  /** progress 0..1 */
  set(progress: number): void {
    this.bar.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  }

  hide(): void {
    this.root.dataset.hidden = '1';
  }
}
