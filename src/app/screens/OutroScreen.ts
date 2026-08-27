import type { ScreenName } from '@/core/GameState';
import { t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 데모의 끝 — Ch.1 「들판의 추격전」 최초 완수 1회.
 *
 * **프롤로그가 건 약속을 회수하는 화면이다.** 소린 장관은 시작에서
 * "격파를 증명하면, 장비가 갑니다"라고 했다 — 여기서 첫 실적이 확인되고 보급이 승인된다.
 * 그래서 연출 문법도 프롤로그와 같다(무전 프린터 타이핑): 같은 목소리로 열고 닫는다.
 *
 * 바딤의 마지막 줄은 Ch.1 의 주제("트럭 하나 잡고 손이 떨리는 경험", 03 문서 1막)를
 * 닫는다. 실패가 아니라 **완수한 사람에게** 하는 말이라 무게가 다르다.
 */
export class OutroScreen implements Screen {
  readonly name: ScreenName = 'outro';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private full = '';
  private shown = 0;
  private rendered = -1;
  private startedAt = 0;

  /** 프롤로그와 같은 속도 — 같은 무전 프린터다 */
  private static readonly CPS = 48;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    this.full = [
      t('story.ch1.minister.quota_intro'),
      '',
      t('story.ch1.debrief.vadym'),
    ].join('\n');
    this.shown = 0;
    this.rendered = -1;
    this.startedAt = ctx.time.wall;

    this.root = document.createElement('div');
    this.root.id = 'outro';
    this.root.innerHTML =
      `<div class="st-panel ou-panel">` +
      `<div class="ou-head">${t('outro.title')}</div>` +
      `<pre class="st-body ou-body"></pre>` +
      `<div class="ou-end">${t('outro.demoEnd')}</div>` +
      `<div class="ou-next">${t('outro.next')}</div>` +
      `<div class="st-row">` +
      `<button class="lo-opt ou-again">${t('outro.again')}</button>` +
      `<button class="db-btn ou-hangar">${t('outro.hangar')}</button>` +
      `</div></div>`;
    ctx.overlay.appendChild(this.root);
    this.body = this.root.querySelector('.ou-body');

    this.root.querySelector('.ou-hangar')?.addEventListener('click', (e) => {
      e.stopPropagation();
      // 장관이 "격납고를 확인하십시오"라고 했으니 실제로 거기로 보낸다
      this.ctx.go('hangar');
    });
    this.root.querySelector('.ou-again')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ctx.go('loadout');
    });
    this.root.addEventListener('click', () => {
      this.shown = this.full.length;
    });
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') {
        if (this.shown < this.full.length) this.shown = this.full.length;
        else this.ctx.go('hangar');
      }
    });
  }

  update(): void {
    if (!this.body) return;
    this.shown = Math.min(
      this.full.length,
      Math.max(this.shown, Math.floor((this.ctx.time.wall - this.startedAt) * OutroScreen.CPS)),
    );
    if (this.shown !== this.rendered) {
      this.rendered = this.shown;
      this.body.textContent =
        this.full.slice(0, this.shown) + (this.shown < this.full.length ? '▮' : '');
    }
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
    this.body = null;
  }
}
