import type { ScreenName } from '@/core/GameState';
import { M2_1 } from '@/data/missions';
import { t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 미션 브리핑 — 03 문서 4장 규격 그대로:
 * [발신] / ■ 작전명 / ■ 상황 / ■ 임무 / ■ 조언 / "한 줄".
 *
 * 무전 텍스트가 **타이핑되며** 나타난다(음성·컷신 비용 0 원칙의 연출 대체).
 * 화면 아무 데나 누르면 전부 출력 — 두 번째 판부터 기다리게 하지 않는다.
 */
export class BriefingScreen implements Screen {
  readonly name: ScreenName = 'briefing';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private full = '';
  private shown = 0;
  /** 마지막으로 DOM 에 그린 길이 — 스킵 클릭이 shown 만 바꾸면 재렌더가 죽는 버그 방지 */
  private rendered = -1;
  private startedAt = 0;

  /** 초당 타이핑 글자 수 — 무전기 프린터 감. */
  private static readonly CPS = 55;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    const def = M2_1;
    this.full = [
      t('brief.speaker'),
      '',
      `${t('brief.label.op')} ${t(def.titleKey)}`,
      `${t('brief.label.situation')} ${t(def.brief.situationKey)}`,
      `${t('brief.label.objective')} ${t(def.brief.objectiveKey)}`,
      `${t('brief.label.tip')} ${t(def.brief.tipKey)}`,
      '',
      t(def.brief.flavorKey),
    ].join('\n');
    this.shown = 0;
    this.startedAt = ctx.time.wall;

    this.root = document.createElement('div');
    this.root.id = 'briefing';
    this.root.innerHTML =
      `<div class="br-panel">` +
      `<pre class="br-body"></pre>` +
      `<button class="db-btn br-launch">${t('brief.launch')}</button>` +
      `</div>`;
    ctx.overlay.appendChild(this.root);
    this.body = this.root.querySelector('.br-body');

    this.root.querySelector('.br-launch')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.launch();
    });
    // 패널 아무 데나 탭 → 타이핑 스킵
    this.root.addEventListener('click', () => {
      this.shown = this.full.length;
    });
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') {
        if (this.shown < this.full.length) this.shown = this.full.length;
        else this.launch();
      }
    });
  }

  private launch(): void {
    this.ctx.go('link');
  }

  update(): void {
    if (!this.body) return;
    // 벽시계 — 시뮬 시간(dt 클램프)으로 재면 저사양에서 타이핑이 몇 배로 늘어진다
    this.shown = Math.min(
      this.full.length,
      Math.max(this.shown, Math.floor((this.ctx.time.wall - this.startedAt) * BriefingScreen.CPS)),
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
