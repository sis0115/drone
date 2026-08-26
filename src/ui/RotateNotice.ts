import { t } from '@/i18n';

/**
 * 세로로 들었을 때 뜨는 안내.
 *
 * `screen.orientation.lock('landscape')` 은 **믿을 수 없다** —
 * iOS Safari 는 지원하지 않고, 안드로이드 크롬도 전체화면일 때만 받는다.
 * 즉 폰에서 세로로 들면 16:9 화면이 그대로 찌그러진다(GDD 7장은 가로 고정 전제).
 *
 * 보이고 숨기는 판단은 **CSS 미디어 쿼리**가 한다. JS 로 방향을 폴링하면
 * 회전 도중 값이 튀고, 무엇보다 화면 하나가 이걸 소유하게 되면
 * 다른 화면에서 사라지는 버그가 생긴다. 여기는 앱 수명 내내 떠 있는 한 장이다.
 */
export class RotateNotice {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'rotate-notice';
    this.root.setAttribute('role', 'status');
    this.root.innerHTML =
      `<span class="rotate-mark" aria-hidden="true">▭</span>` +
      `<span class="rotate-text">${t('ui.rotate')}</span>`;
    parent.appendChild(this.root);
  }

  dispose(): void {
    this.root.remove();
  }
}
