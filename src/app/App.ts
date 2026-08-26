import { FpvRenderer } from '@/render/Renderer';
import { Time } from '@/core/Time';
import { bus } from '@/core/EventBus';
import { state } from '@/core/GameState';
import type { ScreenName } from '@/core/GameState';
import { load } from '@/core/Save';
import { applyTheme } from '@/data/theme';
import { setLocale, type Locale } from '@/i18n';
import { platform } from '@/platform';
import { KeyboardInput } from '@/input/KeyboardInput';
import { TouchInput } from '@/input/TouchInput';
import { NEUTRAL, type InputFrame, type InputSource } from '@/input/InputSource';
import { RotateNotice } from '@/ui/RotateNotice';
import type { AppContext, Screen } from './Screen';

/**
 * 앱 수명주기. **루프를 소유하는 유일한 곳**이다.
 *
 * 여기가 하는 일은 셋뿐:
 *   1. 부트스트랩(테마·저장·로케일·렌더러)
 *   2. 화면 전환
 *   3. 프레임 루프 — 입력 샘플 → 현재 화면 update → 렌더
 *
 * **게임 규칙을 여기 넣지 말 것.** 그건 화면과 시스템의 몫이다.
 */
export class App {
  readonly renderer: FpvRenderer;
  readonly time = new Time();

  private readonly screens = new Map<ScreenName, Screen>();
  private currentScreen: Screen | null = null;
  private readonly keyboard = new KeyboardInput();
  /** 가상 패드. UI(PadOverlay)가 이걸 그리고, 여기서는 값만 읽는다. */
  readonly touch = new TouchInput();
  private scripted: InputSource | null = null;
  private lastInput: InputFrame = { ...NEUTRAL };
  private running = false;

  constructor(canvas: HTMLCanvasElement, private readonly overlay: HTMLElement) {
    applyTheme();
    state.profile = load();
    setLocale(state.profile.settings.lang as Locale);

    this.renderer = new FpvRenderer(canvas);
    // 가로 고정은 브라우저가 거부할 수 있다(iOS 는 아예 없다) — 안내 한 장을 항상 띄워 둔다
    new RotateNotice(overlay);
    this.keyboard.onAction = (code) => this.onKeyAction?.(code);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  /** 단발 키 액션(모드 전환 등). 현재 화면이 처리한다. */
  onKeyAction: ((code: string) => void) | null = null;

  register(screen: Screen): this {
    this.screens.set(screen.name, screen);
    return this;
  }

  get context(): AppContext {
    return {
      renderer: this.renderer,
      time: this.time,
      bus,
      state,
      platform: platform(),
      overlay: this.overlay,
      touch: this.touch,
      go: (name) => this.go(name),
      onKeyAction: (handler) => {
        this.onKeyAction = handler;
      },
    };
  }

  go(name: ScreenName): void {
    const next = this.screens.get(name);
    if (!next || next === this.currentScreen) return;
    const from = this.currentScreen?.name ?? 'none';
    this.currentScreen?.exit();
    this.onKeyAction = null; // 이전 화면의 구독을 끊는다
    this.currentScreen = next;
    state.screen = name;
    next.enter(this.context);
    bus.emit('screen:changed', { from, to: name });
  }

  start(first: ScreenName): void {
    if (this.running) return;
    this.running = true;
    this.go(first);
    requestAnimationFrame((t) => {
      this.time.reset(t);
      bus.emit('app:ready');
      requestAnimationFrame(this.loop);
    });
  }

  /** 입력 소스 교체 — Playwright 스크립트가 사람과 같은 자리에 꽂힌다. */
  setInputSource(source: InputSource | null): void {
    this.scripted = source;
  }

  get input(): InputFrame {
    return this.lastInput;
  }

  get screen(): Screen | null {
    return this.currentScreen;
  }

  private readonly loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = this.time.tick(now);

    this.lastInput = this.sampleInput(dt);

    this.currentScreen?.update(dt, this.lastInput);
    this.renderer.render(this.time.elapsed, state.signalQuality);
  };

  /**
   * 입력 합성. 스크립트가 꽂혀 있으면 그것만 쓰고(테스트 재현성),
   * 아니면 **키보드가 눌린 축은 키보드가, 나머지는 패드가** 이긴다.
   * 데스크톱에서 키보드로 잡다가 패드를 만져도 끊기지 않는다.
   */
  private sampleInput(dt: number): InputFrame {
    if (this.scripted) return this.scripted.sample(this.time.elapsed, dt);

    const key = this.keyboard.sample();
    const pad = this.touch.sample();
    return {
      pitch: key.pitch || pad.pitch,
      roll: key.roll || pad.roll,
      yaw: key.yaw || pad.yaw,
      throttle: key.throttle || pad.throttle,
      fire: key.fire || pad.fire,
    };
  }

  private readonly onResize = (): void => {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.currentScreen?.exit();
    this.keyboard.dispose();
    this.renderer.dispose();
  }
}
