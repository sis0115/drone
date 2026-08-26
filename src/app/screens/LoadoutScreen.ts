import type { ScreenName } from '@/core/GameState';
import { save } from '@/core/Save';
import { fmt, t } from '@/i18n';
import type { Assist } from '@/data/controls';
import type { AppContext, Screen } from '../Screen';

/**
 * 작전실/로드아웃 — T9 최소판.
 *
 * 장비가 1셋뿐인 지금 이 화면의 실질은 **조종 방식 선택 + 전적 확인 + 출격**이다.
 * 기체·모듈 상점은 v0.3(작전 요청·상점)에서 이 화면에 늘어난다 — 자리는 지금 잡는다.
 *
 * 어시스트 ↔ 비행 모델 매핑 (GDD 7장): full=아케이드 / semi·acro=프로.
 * 저장 시점: 설정 변경 즉시 (05 문서 1장).
 */
const ASSIST_ORDER: Assist[] = ['full', 'semi', 'acro'];

export class LoadoutScreen implements Screen {
  readonly name: ScreenName = 'loadout';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.id = 'loadout';
    ctx.overlay.appendChild(this.root);
    this.render();
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') this.sortie();
    });
  }

  private render(): void {
    if (!this.root) return;
    const profile = this.ctx.state.profile;
    const assist = (profile?.settings.assist ?? 'full') as Assist;
    const stick = profile?.settings.stickMode ?? 2;

    const assistButtons = ASSIST_ORDER.map(
      (a) =>
        `<button class="lo-opt ${a === assist ? 'on' : ''}" data-assist="${a}">${t(`assist.${a}`)}</button>`,
    ).join('');
    const stickButtons = [1, 2]
      .map((m) => `<button class="lo-opt ${m === stick ? 'on' : ''}" data-stick="${m}">MODE ${m}</button>`)
      .join('');

    this.root.innerHTML =
      `<div class="lo-panel">` +
      `<div class="lo-head"><span>${t('ui.home.title')}</span>` +
      `<span class="lo-sp">${fmt('loadout.sp', profile?.sp ?? 0)}</span></div>` +
      `<div class="lo-stats">${fmt(
        'loadout.stats',
        profile?.stats.totalKills ?? 0,
        profile?.stats.framesLost ?? 0,
        Math.round((profile?.stats.flightTimeSec ?? 0) / 60),
      )}</div>` +
      `<div class="lo-row"><span class="lo-label">${t('loadout.assist')}</span>${assistButtons}</div>` +
      `<div class="lo-row"><span class="lo-label">${t('loadout.stick')}</span>${stickButtons}</div>` +
      `<button class="db-btn lo-sortie">${t('loadout.sortie')}</button>` +
      `</div>`;

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-assist]')) {
      el.addEventListener('click', () => this.setAssist(el.dataset.assist as Assist));
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-stick]')) {
      el.addEventListener('click', () => this.setStick(Number(el.dataset.stick)));
    }
    this.root.querySelector('.lo-sortie')?.addEventListener('click', () => this.sortie());
  }

  private setAssist(assist: Assist): void {
    const profile = this.ctx.state.profile;
    if (!profile) return;
    profile.settings.assist = assist;
    // GDD 7장: full=아케이드, semi·acro=프로. 세부(acro 레이트)는 비행 화면이 읽는다.
    this.ctx.state.flightMode = assist === 'full' ? 'arcade' : 'pro';
    save(profile);
    this.render();
  }

  private setStick(mode: number): void {
    const profile = this.ctx.state.profile;
    if (!profile) return;
    profile.settings.stickMode = mode;
    save(profile);
    this.render();
  }

  private sortie(): void {
    this.ctx.go('link');
  }

  update(): void {
    /* 정적 화면 */
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
  }
}
