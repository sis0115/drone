import type { FpvRenderer } from '@/render/Renderer';
import type { Time } from '@/core/Time';
import type { EventBus } from '@/core/EventBus';
import type { GameState, ScreenName } from '@/core/GameState';
import type { Platform } from '@/platform';
import type { InputFrame } from '@/input/InputSource';
import type { TouchInput } from '@/input/TouchInput';

/**
 * 화면 하나의 계약. GDD 2장의 화면 흐름이 이 인터페이스의 구현들로 표현된다.
 *
 * **화면끼리 서로를 직접 부르지 않는다.** 전환은 `ctx.go()` 로만 하고,
 * 다른 시스템에 알릴 일은 EventBus 로 보낸다 (절대 규칙 7).
 */
export interface Screen {
  readonly name: ScreenName;
  /** 진입. 무거운 준비(월드 생성 등)는 여기서 한다. */
  enter(ctx: AppContext): void;
  /** 이탈. 리소스 해제·이벤트 구독 해제. */
  exit(): void;
  /** 매 프레임. 렌더 호출은 App 이 한다 — 화면은 상태만 굴린다. */
  update(dt: number, input: InputFrame): void;
}

/** 화면이 App 에게서 받는 것들. 전역 import 대신 이걸로 받는다(테스트 가능성). */
export interface AppContext {
  readonly renderer: FpvRenderer;
  readonly time: Time;
  readonly bus: EventBus;
  readonly state: GameState;
  readonly platform: Platform;
  /** DOM 오버레이 루트 (HUD·패널이 붙는 곳) */
  readonly overlay: HTMLElement;
  /** 가상 패드 입력. 화면이 이걸 UI 로 그린다. */
  readonly touch: TouchInput;
  /** 화면 전환 요청 */
  go(name: ScreenName): void;
  /** 단발 키 액션 구독 (모드 전환 등). 화면이 바뀌면 자동으로 해제된다. */
  onKeyAction(handler: (code: string) => void): void;
}
