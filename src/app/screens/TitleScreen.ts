import type { ScreenName } from '@/core/GameState';
import { t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 타이틀(대기 화면) — 04 문서 3.1 와이어프레임 그대로:
 * 로고(4초마다 글리치 1회) + "▮ 접속하려면 탭"(커서 깜빡임) + 버전.
 *
 * 배경은 **무신호 채널의 노이즈**다 — 렌더러의 빈 씬에 `uDead=1` 을 걸면
 * 정지 노이즈가 공짜로 나온다. 게임의 첫 화면부터 "링크"라는 어휘로 말한다.
 */
export class TitleScreen implements Screen {
  readonly name: ScreenName = 'title';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    ctx.renderer.uniforms.uDead.value = 1;

    this.root = document.createElement('div');
    this.root.id = 'title';
    this.root.innerHTML =
      `<div class="ti-logo">SIGNAL LOST <span class="ti-fpv">: FPV</span></div>` +
      `<div class="ti-tagline">${t('title.tagline')}</div>` +
      `<div class="ti-tap">${t('ui.title.tap')}</div>` +
      `<div class="ti-foot"><span>v0.2</span><span>${__BUILD_BRANCH__} ${__BUILD_ID__}</span></div>`;
    ctx.overlay.appendChild(this.root);

    this.root.addEventListener('click', () => this.connect());
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') this.connect();
    });
  }

  private connect(): void {
    // 최초 1회는 프롤로그 — 본 뒤에는 곧장 작전실 (04 문서 흐름)
    const profile = this.ctx.state.profile;
    this.ctx.go(profile && !profile.introSeen ? 'ops' : 'loadout');
  }

  update(): void {
    /* 정적 — 배경 노이즈는 렌더러가 그린다 */
  }

  exit(): void {
    this.ctx.renderer.uniforms.uDead.value = 0;
    this.root?.remove();
    this.root = null;
  }
}
