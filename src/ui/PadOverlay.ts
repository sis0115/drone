import { PAD } from '@/data/controls';
import { t } from '@/i18n';
import type { TouchInput } from '@/input/TouchInput';

/**
 * 가상 패드의 화면 표현. 입력 판정은 `TouchInput` 이 하고 여기는 **그리기만** 한다.
 *
 * 04 문서의 "라운드 버튼 금지"는 버튼 이야기다 — 스틱은 조종 장치이고
 * 프로토타입(기준선)도 원형이다. 대신 채우기 없이 점선 테두리만 쓴다.
 */
export class PadOverlay {
  private readonly root: HTMLElement;
  private readonly sticks: Record<'left' | 'right', HTMLElement>;
  private readonly knobs: Record<'left' | 'right', HTMLElement>;
  /**
   * 축 수치 읽기 — **개발 빌드 전용**.
   * FPV 화면이 이 게임의 핵심인데 상시 노출되면 그 화면을 가린다
   * (07 문서 3장: 튜닝 패널은 개발 빌드 전용과 같은 원칙).
   */
  private readonly readout: HTMLElement | null;

  constructor(parent: HTMLElement, private readonly input: TouchInput) {
    this.root = document.createElement('div');
    this.root.id = 'pads';
    this.root.innerHTML = `
      <div class="stick" data-side="left">
        <div class="knob"></div>
        <span class="ax u">${t('ui.pad.up')}</span><span class="ax d">${t('ui.pad.down')}</span>
        <span class="ax l">${t('ui.pad.turn_left')}</span><span class="ax r">${t('ui.pad.turn_right')}</span>
        <span class="padlbl">${t('ui.pad.throttle_yaw')}</span>
      </div>
      <div class="stick" data-side="right">
        <div class="knob"></div>
        <span class="ax u">${t('ui.pad.forward')}</span><span class="ax d">${t('ui.pad.back')}</span>
        <span class="ax l">${t('ui.pad.left')}</span><span class="ax r">${t('ui.pad.right')}</span>
        <span class="padlbl">${t('ui.pad.pitch_roll')}</span>
      </div>
      ${import.meta.env.DEV ? '<div class="padvals" data-role="readout"></div>' : ''}
    `;
    parent.appendChild(this.root);

    const stick = (side: string) => this.root.querySelector<HTMLElement>(`[data-side="${side}"]`)!;
    this.sticks = { left: stick('left'), right: stick('right') };
    this.knobs = {
      left: this.sticks.left.querySelector('.knob')!,
      right: this.sticks.right.querySelector('.knob')!,
    };
    this.readout = this.root.querySelector('[data-role="readout"]');

    this.attach();
    this.syncCenters();
    window.addEventListener('resize', this.syncCenters);
  }

  /** 패드 중심(화면 좌표)을 입력 쪽에 알려 준다 — 화면 크기가 바뀌면 다시. */
  private readonly syncCenters = (): void => {
    for (const side of ['left', 'right'] as const) {
      const r = this.sticks[side].getBoundingClientRect();
      this.input.centers[side] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  };

  /**
   * 포인터 이벤트로 받는다 — 터치·마우스·펜을 한 경로로 처리한다.
   * (프로토타입은 touch 전용이라 데스크톱에서 조작이 안 됐다.)
   */
  private attach(): void {
    const target = window;
    target.addEventListener('pointerdown', (e) => {
      const pad = this.input.padFor(e.clientX, window.innerWidth);
      const side = pad === this.input.left ? 'left' : 'right';
      pad.grab(e.pointerId, e.clientX, e.clientY, this.input.centers[side]);
      this.sticks[side].classList.add('on');
    });
    target.addEventListener('pointermove', (e) => {
      this.input.left.move(e.pointerId, e.clientX, e.clientY);
      this.input.right.move(e.pointerId, e.clientX, e.clientY);
      // 스크롤·당겨서 새로고침이 조작을 끊지 않게.
      if (this.input.active && e.cancelable) e.preventDefault();
    });
    const end = (e: PointerEvent): void => {
      for (const side of ['left', 'right'] as const) {
        const pad = side === 'left' ? this.input.left : this.input.right;
        if (pad.active) {
          pad.release(e.pointerId);
          if (!pad.active) this.sticks[side].classList.remove('on');
        }
      }
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  /** 매 프레임 노브 위치와 축 수치를 갱신한다. */
  update(): void {
    for (const side of ['left', 'right'] as const) {
      const v = side === 'left' ? this.input.left.value : this.input.right.value;
      this.knobs[side].style.transform =
        `translate(${v.x * PAD.knobTravel}px, ${v.y * PAD.knobTravel}px)`;
    }
    if (!this.readout) return;
    const f = this.input.sample();
    const n = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    this.readout.textContent =
      `THR ${n(f.throttle)}  YAW ${n(f.yaw)}   PIT ${n(f.pitch)}  ROL ${n(f.roll)}`;
  }

  dispose(): void {
    window.removeEventListener('resize', this.syncCenters);
    this.root.remove();
  }
}
