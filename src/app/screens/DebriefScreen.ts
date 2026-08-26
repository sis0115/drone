import type { ScreenName } from '@/core/GameState';
import { fmt, t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 디브리핑 — T8c. GDD 4.5 규칙 4: **실패가 가르친다.**
 * 격추 원인 1줄 + 권고가 자동으로 나와야 "다음엔 된다"는 확신이 생긴다.
 *
 * 배경은 일부러 비워 둔다 — 렌더러가 마지막 프레임(SIGNAL LOST 노이즈)을 계속
 * 그리고 있어서, 정지 화면 위에 무전 텍스트가 얹히는 연출이 공짜로 나온다.
 * UI 는 04 문서 금지 목록을 지킨다: 사각 테두리, 8색 토큰, 축하 문구 없음.
 */
export class DebriefScreen implements Screen {
  readonly name: ScreenName = 'debrief';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    const d = ctx.state.debrief;

    this.root = document.createElement('div');
    this.root.id = 'debrief';

    // 원인 1줄 — 위협 격추면 "원인 + 접근 고도 + 권고", 그 외엔 사유만
    const causeLines = d
      ? d.threat
        ? `<div class="db-line red">${fmt('debrief.causeThreat', t(d.threat.causeKey), d.threat.agl.toFixed(0))}</div>` +
          `<div class="db-line amb">${fmt('debrief.advice', fmt(d.threat.adviceKey, ...d.threat.adviceParams))}</div>`
        : d.cleared
          ? ''
          : `<div class="db-line red">${fmt('debrief.cause', t(d.causeKey))}</div>`
      : '';

    this.root.innerHTML = d
      ? `<div class="db-panel">` +
        `<div class="db-title">${t(d.titleKey)}</div>` +
        `<div class="db-result ${d.cleared ? 'ok' : 'bad'}">${t(d.cleared ? 'debrief.win' : 'debrief.loss')}</div>` +
        `<div class="db-line">${fmt('debrief.kills', d.kills, d.goal)}</div>` +
        `<div class="db-line">${fmt('debrief.time', d.flightSec)}</div>` +
        causeLines +
        `<button class="db-btn">${t('debrief.redeploy')}</button>` +
        `</div>`
      : `<div class="db-panel"><button class="db-btn">${t('debrief.redeploy')}</button></div>`;

    ctx.overlay.appendChild(this.root);
    this.root.querySelector('.db-btn')?.addEventListener('click', () => this.redeploy());
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') this.redeploy();
    });
  }

  private redeploy(): void {
    // 링크 재수립 연출부터 — 재출격도 하나의 접속이다
    this.ctx.go('link');
  }

  update(): void {
    /* 정적 화면 — 렌더러가 배경(정지 노이즈)을 계속 그린다 */
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
  }
}
