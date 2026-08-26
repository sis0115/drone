import { t } from '@/i18n';

/**
 * 링크 접속 게이지 — 인게임 진입 로딩을 연출로 소화한다 (04 문서 2장).
 * 검은 화면 + LINK ESTABLISHING + RSSI 게이지가 차오름.
 *
 * 이건 **DOM 위젯**이지 `app/Screen` 이 아니다. LinkScreen 이 이걸 쓴다.
 */
export class LinkGauge {
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
