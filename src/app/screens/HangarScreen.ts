import type { ScreenName } from '@/core/GameState';
import { save } from '@/core/Save';
import { FRAMES, type FrameDef } from '@/data/frames';
import { fmt, t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 격납고 — 기체 선택·보급 요청 (04 문서 3.2 메뉴 항목 / 05 문서 4.3 가격표).
 *
 * 기체는 **청사진 라인 드로잉**으로 보여준다 (GDD 6.5.2 "청사진 전개"의 어휘,
 * 에셋 파일 금지 원칙 — 실루엣은 인라인 SVG 로 그린다).
 * 구매는 SP 로만 한다. 성능 P2W 아님 — SP 는 격파로만 번다.
 */
export class HangarScreen implements Screen {
  readonly name: ScreenName = 'hangar';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.id = 'hangar';
    ctx.overlay.appendChild(this.root);
    this.render();
    ctx.onKeyAction((code) => {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') this.ctx.go('loadout');
    });
  }

  /** 청사진 실루엣 — 쿼드콥터 탑뷰. 티어가 높을수록 프레임이 크고 탄두가 보인다. */
  private blueprint(frame: FrameDef): string {
    const big = frame.tier >= 2;
    const arm = big ? 34 : 26;
    const rotor = big ? 15 : 11;
    const body = big ? 13 : 10;
    const c = 60;
    const arms = [
      [c - arm, c - arm],
      [c + arm, c - arm],
      [c - arm, c + arm],
      [c + arm, c + arm],
    ]
      .map(
        ([x, y]) =>
          `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}"/>` +
          `<circle cx="${x}" cy="${y}" r="${rotor}" stroke-dasharray="3 3"/>` +
          `<circle cx="${x}" cy="${y}" r="2"/>`,
      )
      .join('');
    const warhead = big
      ? `<rect x="${c - 4}" y="${c + body + 2}" width="8" height="14"/>` +
        `<line x1="${c}" y1="${c + body + 16}" x2="${c}" y2="${c + body + 20}"/>`
      : '';
    return (
      `<svg viewBox="0 0 120 120" class="hg-bp" aria-hidden="true">` +
      `<g fill="none" stroke="currentColor" stroke-width="1.1">` +
      `<rect x="4" y="4" width="112" height="112" stroke-dasharray="2 5" opacity="0.35"/>` +
      arms +
      `<rect x="${c - body}" y="${c - body}" width="${body * 2}" height="${body * 2}"/>` +
      `<line x1="${c - body}" y1="${c}" x2="${c + body}" y2="${c}" opacity="0.5"/>` +
      `<circle cx="${c}" cy="${c - body - 4}" r="2.4"/>` +
      warhead +
      `</g></svg>`
    );
  }

  private render(): void {
    if (!this.root) return;
    const profile = this.ctx.state.profile;
    if (!profile) return;

    const cards = FRAMES.map((frame) => {
      const owned = profile.ownedFrames.includes(frame.id);
      const equipped = profile.loadout.frame === frame.id;
      const affordable = profile.sp >= frame.priceSp;
      const button = equipped
        ? `<span class="hg-badge">${t('hangar.equipped')}</span>`
        : owned
          ? `<button class="db-btn hg-act" data-select="${frame.id}">${t('hangar.select')}</button>`
          : affordable
            ? `<button class="db-btn hg-act" data-buy="${frame.id}">${fmt('hangar.buy', frame.priceSp)}</button>`
            : `<span class="hg-badge dim">${fmt('hangar.buy', frame.priceSp)} — ${t('hangar.locked')}</span>`;
      return (
        `<div class="hg-card ${equipped ? 'on' : ''} ${owned ? '' : 'ghosted'}">` +
        this.blueprint(frame) +
        `<div class="hg-name">${t(frame.nameKey)} <span class="hg-tier">T${frame.tier}</span></div>` +
        `<div class="hg-stat">${t(frame.statKey)}</div>` +
        `<div class="hg-desc">${t(frame.descKey)}</div>` +
        button +
        `</div>`
      );
    }).join('');

    // 뒤로가기는 헤더에 — 카드 아래 두면 가로 폰(높이 ~390px)에서 스크롤 밖으로 밀린다
    this.root.innerHTML =
      `<div class="hg-panel">` +
      `<div class="hg-head">` +
      `<button class="lo-opt hg-back">${t('hangar.back')}</button>` +
      `<span>${t('hangar.title')}</span>` +
      `<span class="lo-sp">${fmt('loadout.sp', profile.sp)}</span></div>` +
      `<div class="hg-cards">${cards}</div>` +
      `</div>`;

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-select]')) {
      el.addEventListener('click', () => this.select(el.dataset.select!));
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-buy]')) {
      el.addEventListener('click', () => this.buy(el.dataset.buy!));
    }
    this.root.querySelector('.hg-back')?.addEventListener('click', () => this.ctx.go('loadout'));
  }

  private select(id: string): void {
    const profile = this.ctx.state.profile;
    if (!profile || !profile.ownedFrames.includes(id)) return;
    profile.loadout.frame = id;
    save(profile);
    this.render();
  }

  private buy(id: string): void {
    const profile = this.ctx.state.profile;
    const frame = FRAMES.find((f) => f.id === id);
    if (!profile || !frame || profile.ownedFrames.includes(id) || profile.sp < frame.priceSp) return;
    profile.sp -= frame.priceSp;
    profile.ownedFrames.push(id);
    // 산 김에 바로 배치 — 두 번 누르게 하지 않는다
    profile.loadout.frame = id;
    save(profile);
    this.ctx.bus.emit('sp:changed', { sp: profile.sp, delta: -frame.priceSp });
    this.render();
  }

  update(): void {
    /* 정적 화면 */
  }

  exit(): void {
    this.root?.remove();
    this.root = null;
  }
}
