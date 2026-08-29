import type { ScreenName } from '@/core/GameState';
import { SP_VALUE } from '@/data/economy';
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

    // 고스트의 확인 무전 — 완수했을 때만. 프로토타입 v0.7 의 그 대사다 (03 문서).
    const ghost = d?.cleared ? `<div class="db-line ghost">${t('radio.m2.kill')}</div>` : '';

    /**
     * SP 정산 내역 — Ch.1 의 주제가 **확인 킬 학습**이라(03 문서 1막)
     * "격파 40 / 고스트 확인 +40" 을 눈으로 보여 준다. 바딤의 교육 한 줄이 그 밑에 붙어
     * 숫자와 개념이 같은 화면에서 만난다: 확인 없는 격파는 소문일 뿐이다.
     */
    const breakdown = d
      ? [
          d.spBase > 0 ? `<div class="db-sub">${fmt('debrief.spBase', d.kills, SP_VALUE.truck)}</div>` : '',
          d.spConfirm > 0 ? `<div class="db-sub">${fmt('debrief.spConfirm', d.spConfirm)}</div>` : '',
          d.spFirstClear > 0
            ? `<div class="db-sub amb">${fmt('debrief.spFirst', d.spFirstClear)}</div>`
            : '',
          // 자폭 드론의 출격 유지비 — 기본 지급 기체(0원)면 줄 자체가 없다
          d.spLoss > 0 ? `<div class="db-sub red">${fmt('debrief.spLoss', d.spLoss)}</div>` : '',
        ].join('')
      : '';
    const lesson = d?.cleared ? `<div class="db-line">${t('story.ch1.radio.confirm_teach')}</div>` : '';
    // 실패의 끝 — 기체는 소모품이고 너는 아니다. 데모가 여기서 막히지 않는다는 신호다.
    const lossNote = d && !d.cleared ? `<div class="db-line">${t('debrief.lossNote')}</div>` : '';
    // 최초 완수면 데모 종료(아웃트로)로, 그 밖에는 재출격으로
    const buttonKey = d?.firstClear ? 'debrief.continue' : 'debrief.redeploy';

    this.root.innerHTML = d
      ? `<div class="db-panel">` +
        `<div class="db-title">${t(d.titleKey)}</div>` +
        `<div class="db-result ${d.cleared ? 'ok' : 'bad'}">${t(d.cleared ? 'debrief.win' : 'debrief.loss')}</div>` +
        `<div class="db-line">${fmt('debrief.kills', d.kills, d.goal)}</div>` +
        `<div class="db-line">${fmt('debrief.time', d.flightSec)}</div>` +
        (d.spEarned > 0
          ? `<div class="db-line amb">${fmt('debrief.sp', d.spEarned, d.spTotal)}</div>` + breakdown
          : '') +
        causeLines +
        ghost +
        lesson +
        lossNote +
        `<button class="db-btn">${t(buttonKey)}</button>` +
        `</div>`
      : `<div class="db-panel"><button class="db-btn">${t('debrief.redeploy')}</button></div>`;

    ctx.overlay.appendChild(this.root);
    this.root.querySelector('.db-btn')?.addEventListener('click', () => this.redeploy());
    ctx.onKeyAction((code) => {
      if (code === 'Enter' || code === 'Space') this.redeploy();
    });
  }

  private redeploy(): void {
    // 최초 완수는 데모의 끝으로 — 프롤로그가 건 약속(증명하면 장비가 간다)을 회수한다.
    // 그 밖에는 작전실로: 조종 방식을 바꾸거나 전적을 확인하고 다시 나간다 (T9)
    this.ctx.go(this.ctx.state.debrief?.firstClear ? 'outro' : 'loadout');
  }

  update(): void {
    /* 정적 화면 — 렌더러가 배경(정지 노이즈)을 계속 그린다 */
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
  }
}
