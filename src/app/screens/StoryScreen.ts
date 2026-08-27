import type { ScreenName } from '@/core/GameState';
import { save } from '@/core/Save';
import { t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 스토리 프롤로그 — 03 문서 1막 "모니터 앞의 전쟁".
 * 소린 장관의 전군 공지 → 바딤의 첫 대사. 최초 1회만, 언제든 건너뛰기.
 * (화면 이름 'ops'를 쓴다 — 무전 로그(다시보기) 화면이 생기면 그쪽이 이어받는다)
 */
export class StoryScreen implements Screen {
  readonly name: ScreenName = 'ops';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private full = '';
  private shown = 0;
  private rendered = -1;
  private startedAt = 0;

  private static readonly CPS = 48;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    this.full = [
      t('story.prologue.context'),
      '',
      t('story.prologue.header'),
      t('story.prologue.minister'),
      '',
      t('story.prologue.vadim'),
    ].join('\n');
    this.shown = 0;
    this.rendered = -1;
    this.startedAt = ctx.time.wall;

    this.root = document.createElement('div');
    this.root.id = 'story';
    this.root.innerHTML =
      `<div class="st-panel">` +
      `<pre class="st-body"></pre>` +
      `<div class="st-row"><button class="lo-opt st-skip">${t('story.skip')}</button>` +
      `<button class="db-btn st-next">${t('story.next')}</button></div>` +
      `</div>`;
    ctx.overlay.appendChild(this.root);
    this.body = this.root.querySelector('.st-body');

    this.root.querySelector('.st-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
    this.root.querySelector('.st-skip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
    this.root.addEventListener('click', () => {
      this.shown = this.full.length;
    });
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') {
        if (this.shown < this.full.length) this.shown = this.full.length;
        else this.finish();
      }
    });
  }

  private finish(): void {
    const profile = this.ctx.state.profile;
    if (profile && !profile.introSeen) {
      profile.introSeen = true;
      save(profile);
    }
    this.ctx.go('loadout');
  }

  update(): void {
    if (!this.body) return;
    this.shown = Math.min(
      this.full.length,
      Math.max(this.shown, Math.floor((this.ctx.time.wall - this.startedAt) * StoryScreen.CPS)),
    );
    if (this.shown !== this.rendered) {
      this.rendered = this.shown;
      this.body.textContent = this.full.slice(0, this.shown) + (this.shown < this.full.length ? '▮' : '');
    }
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
    this.body = null;
  }
}
