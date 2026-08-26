import type { ScreenName } from '@/core/GameState';
import { LinkGauge } from '@/ui/LinkGauge';
import type { AppContext, Screen } from '../Screen';

/**
 * 링크 접속 — 인게임 진입 전 연출 (04 문서 2장).
 * 로딩을 세계관 안의 사건으로 소화한다: "LINK ESTABLISHING…" + RSSI 게이지.
 */
const DURATION_SEC = 0.6;

export class LinkScreen implements Screen {
  readonly name: ScreenName = 'link';

  private ctx!: AppContext;
  private gauge: LinkGauge | null = null;
  private root: HTMLElement | null = null;
  private startedAt = 0;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.id = 'boot';
    ctx.overlay.appendChild(this.root);
    this.gauge = new LinkGauge(this.root);
    // ⚠️ 벽시계를 쓴다. 시뮬레이션 시간(dt 상한 1/20s)을 쓰면
    // 저사양 기기에서 0.6초 연출이 십수 초가 된다(실측, DEVLOG 2026-08-26).
    this.startedAt = ctx.time.wall;
  }

  update(): void {
    if (!this.gauge) return;
    const progress = (this.ctx.time.wall - this.startedAt) / DURATION_SEC;
    this.gauge.set(progress);
    if (progress >= 1) {
      this.gauge.hide();
      this.ctx.bus.emit('link:established');
      this.ctx.go('flight');
    }
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
    this.gauge = null;
  }
}
