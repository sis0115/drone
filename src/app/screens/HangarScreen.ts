import type { ScreenName } from '@/core/GameState';
import { save } from '@/core/Save';
import { LOSS_PENALTY_RATE } from '@/data/economy';
import { FRAMES, type FrameDef } from '@/data/frames';
import { CAMERA_MODULES, type ModuleDef } from '@/data/modules';
import { fmt, t } from '@/i18n';
import type { AppContext, Screen } from '../Screen';

/**
 * 격납고 — 기체·모듈 보급 (04 문서 3.2 메뉴 항목 / 05 문서 4.3 가격표).
 *
 * 기체는 **청사진 라인 드로잉**으로 보여준다 (GDD 6.5.2 "청사진 전개"의 어휘,
 * 에셋 파일 금지 원칙 — 실루엣은 인라인 SVG 로 그린다).
 * 구매는 SP 로만 한다. 성능 P2W 아님 — SP 는 격파로만 번다.
 *
 * **기체와 카메라는 성격이 다르다**: 기체는 자폭으로 매번 잃어 출격마다 유지비
 * (가격의 5%)가 붙고, 카메라 모듈은 잃지 않는다. 그래서 카드에 손실 비용을 적어 둔다 —
 * 사고 나서 알게 하지 않는다.
 */
export class HangarScreen implements Screen {
  readonly name: ScreenName = 'hangar';

  private ctx!: AppContext;
  private root: HTMLElement | null = null;
  /**
   * 슬롯 탭. 두 슬롯을 한 화면에 세로로 쌓았더니 가로 폰(높이 412px)에서
   * 둘째 슬롯의 버튼이 접혔다(실측). 한 번에 한 슬롯만 보여 준다.
   */
  private slot: 'frames' | 'cameras' = 'frames';

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

  /** 카메라 청사진 — 렌즈 정면도. 티어가 높을수록 배럴이 길고 눈금이 촘촘하다. */
  private lens(mod: ModuleDef): string {
    const c = 60;
    const r = mod.tier >= 3 ? 34 : 28;
    const ticks = Array.from({ length: mod.tier >= 3 ? 12 : 8 }, (_, i) => {
      const a = (i / (mod.tier >= 3 ? 12 : 8)) * Math.PI * 2;
      const x1 = c + Math.cos(a) * (r + 5);
      const y1 = c + Math.sin(a) * (r + 5);
      const x2 = c + Math.cos(a) * (r + 11);
      const y2 = c + Math.sin(a) * (r + 11);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }).join('');
    return (
      `<svg viewBox="0 0 120 120" class="hg-bp" aria-hidden="true">` +
      `<g fill="none" stroke="currentColor" stroke-width="1.1">` +
      `<rect x="4" y="4" width="112" height="112" stroke-dasharray="2 5" opacity="0.35"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}"/>` +
      `<circle cx="${c}" cy="${c}" r="${r - 8}" stroke-dasharray="3 3"/>` +
      `<circle cx="${c}" cy="${c}" r="4"/>` +
      ticks +
      `</g></svg>`
    );
  }

  /** 보유/장착/구매/잠김 — 네 상태가 카드 하단 한 줄을 정한다. */
  private action(opts: {
    id: string;
    priceSp: number;
    owned: boolean;
    equipped: boolean;
    sp: number;
    selectable: boolean;
  }): string {
    if (opts.equipped) return `<span class="hg-badge">${t('hangar.equipped')}</span>`;
    if (opts.owned) {
      return opts.selectable
        ? `<button class="db-btn hg-act" data-select="${opts.id}">${t('hangar.select')}</button>`
        : `<span class="hg-badge">${t('hangar.owned')}</span>`;
    }
    return opts.sp >= opts.priceSp
      ? `<button class="db-btn hg-act" data-buy="${opts.id}">${fmt('hangar.buy', opts.priceSp)}</button>`
      : `<span class="hg-badge dim">${fmt('hangar.buy', opts.priceSp)} — ${t('hangar.locked')}</span>`;
  }

  private render(): void {
    if (!this.root) return;
    const profile = this.ctx.state.profile;
    if (!profile) return;

    const frameCards = FRAMES.map((frame) => {
      const owned = profile.ownedFrames.includes(frame.id);
      const equipped = profile.loadout.frame === frame.id;
      // 자폭 드론이라 몰고 나가면 반드시 잃는다 — 출격 유지비를 카드에 적는다
      const loss = Math.round(frame.priceSp * LOSS_PENALTY_RATE);
      const lossNote = loss > 0 ? `<div class="hg-loss">${fmt('hangar.lossNote', loss)}</div>` : '';
      return (
        `<div class="hg-card ${equipped ? 'on' : ''} ${owned ? '' : 'ghosted'}">` +
        this.blueprint(frame) +
        `<div class="hg-body">` +
        `<div class="hg-name">${t(frame.nameKey)} <span class="hg-tier">T${frame.tier}</span></div>` +
        `<div class="hg-stat">${t(frame.statKey)}</div>` +
        `<div class="hg-desc">${t(frame.descKey)}</div>` +
        lossNote +
        this.action({
          id: frame.id,
          priceSp: frame.priceSp,
          owned,
          equipped,
          sp: profile.sp,
          selectable: true,
        }) +
        `</div></div>`
      );
    }).join('');

    // 카메라는 장착 슬롯이 아니라 **해금**이다 — 사면 비행 중 전환 목록에 칸이 하나 는다
    const camCards = CAMERA_MODULES.map((mod) => {
      const owned = profile.ownedModules.includes(mod.id);
      return (
        `<div class="hg-card ${owned ? '' : 'ghosted'}">` +
        this.lens(mod) +
        `<div class="hg-body">` +
        `<div class="hg-name">${t(mod.nameKey)} <span class="hg-tier">T${mod.tier}</span></div>` +
        `<div class="hg-stat">${t(mod.statKey)}</div>` +
        `<div class="hg-desc">${t(mod.descKey)}</div>` +
        this.action({
          id: mod.id,
          priceSp: mod.priceSp,
          owned,
          equipped: false,
          sp: profile.sp,
          selectable: false, // 보유하면 끝 — 전환은 비행 화면에서 한다
        }) +
        `</div></div>`
      );
    }).join('');

    // 뒤로가기는 헤더에 — 카드 아래 두면 가로 폰(높이 ~390px)에서 스크롤 밖으로 밀린다
    this.root.innerHTML =
      `<div class="hg-panel">` +
      `<div class="hg-head">` +
      `<button class="lo-opt hg-back">${t('hangar.back')}</button>` +
      `<span>${t('hangar.title')}</span>` +
      `<span class="lo-sp">${fmt('loadout.sp', profile.sp)}</span></div>` +
      `<div class="hg-tabs">` +
      `<button class="lo-opt ${this.slot === 'frames' ? 'on' : ''}" data-slot="frames">${t('hangar.frames')}</button>` +
      `<button class="lo-opt ${this.slot === 'cameras' ? 'on' : ''}" data-slot="cameras">${t('hangar.cameras')}</button>` +
      `</div>` +
      `<div class="hg-cards">${this.slot === 'frames' ? frameCards : camCards}</div>` +
      `</div>`;

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-slot]')) {
      el.addEventListener('click', () => {
        this.slot = el.dataset.slot as 'frames' | 'cameras';
        this.render();
      });
    }

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
    if (!profile) return;
    const frame = FRAMES.find((f) => f.id === id);
    if (frame) {
      if (profile.ownedFrames.includes(id) || profile.sp < frame.priceSp) return;
      profile.sp -= frame.priceSp;
      profile.ownedFrames.push(id);
      // 산 김에 바로 배치 — 두 번 누르게 하지 않는다
      profile.loadout.frame = id;
      save(profile);
      this.render();
      return;
    }
    const mod = CAMERA_MODULES.find((m) => m.id === id);
    if (!mod || profile.ownedModules.includes(id) || profile.sp < mod.priceSp) return;
    profile.sp -= mod.priceSp;
    profile.ownedModules.push(id);
    profile.loadout.camera = id;
    save(profile);
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
