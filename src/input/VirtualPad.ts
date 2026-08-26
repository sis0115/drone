import { PAD, STICK_DEADZONE } from '@/data/controls';

/**
 * 가상 스틱 한 개. **DOM 을 모른다** — 좌표만 받아 축 값을 낸다.
 * 그래서 브라우저 없이 테스트할 수 있다 (UI 는 `ui/PadOverlay` 가 그린다).
 *
 * 잡는 방식이 두 가지다 (프로토타입 그대로):
 *  - 패드 위를 직접 누르면 **패드 중심** 기준
 *  - 그 외 화면 절반을 누르면 **누른 지점** 기준 (플로팅) — 손 위치를 안 봐도 된다
 */
export interface Axis2 {
  x: number;
  y: number;
}

export class VirtualPad {
  /** -1..1. y 는 화면 좌표계라 아래가 +. */
  readonly value: Axis2 = { x: 0, y: 0 };
  /** 잡고 있는 포인터 id. null 이면 놓은 상태. */
  private pointerId: number | null = null;
  private origin: Axis2 = { x: 0, y: 0 };

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** 패드 중심(화면 좌표)을 받아 잡기 시작한다. */
  grab(pointerId: number, x: number, y: number, center: Axis2): void {
    if (this.pointerId !== null) return;
    const onPad = Math.hypot(x - center.x, y - center.y) < PAD.grabRadius;
    this.pointerId = pointerId;
    this.origin = onPad ? { ...center } : { x, y };
    // 패드를 직접 눌렀다면 그 지점이 곧 입력이다.
    if (onPad) this.move(pointerId, x, y);
  }

  move(pointerId: number, x: number, y: number): void {
    if (this.pointerId !== pointerId) return;
    let dx = (x - this.origin.x) / PAD.travel;
    let dy = (y - this.origin.y) / PAD.travel;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.value.x = deadzone(dx);
    this.value.y = deadzone(dy);
  }

  release(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
  }

  reset(): void {
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
  }
}

function deadzone(v: number): number {
  return Math.abs(v) < STICK_DEADZONE ? 0 : v;
}
