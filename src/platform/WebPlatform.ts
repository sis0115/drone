import type { KeyValueStorage, Platform, PlatformTarget } from './Platform';

/** 브라우저 구현. 지원하지 않는 기능은 조용히 무시한다 — 게임이 멈추면 안 된다. */
class WebStorage implements KeyValueStorage {
  private get store(): Storage | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      // 사생활 보호 모드 등에서 접근 자체가 던진다.
      return null;
    }
  }

  get(key: string): string | null {
    try {
      return this.store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): boolean {
    try {
      this.store?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.store?.removeItem(key);
    } catch {
      /* 무시 */
    }
  }
}

export class WebPlatform implements Platform {
  readonly target: PlatformTarget = 'web';
  readonly storage = new WebStorage();
  /** 웹 빌드는 재고제를 켠다 — 모바일과 같은 루프를 검증해야 하므로. */
  readonly usesFleetStock = true;

  private wakeLock: { release(): Promise<void> } | null = null;

  vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* 미지원 */
    }
  }

  /**
   * 브라우저 제스처 차단. **세 겹으로 막는다** — 하나만으로는 다 안 막힌다:
   *
   * 1. `touch-action: none` (CSS) — 표준이자 주력. 브라우저가 팬·줌을 아예 시작하지 않는다.
   *    한번 네이티브 제스처가 시작되면 포인터 이벤트는 `cancelable: false` 가 되어
   *    `preventDefault()` 로는 **막을 수 없다.** 그래서 선언적으로 미리 꺼야 한다.
   * 2. `gesturestart` 등 (iOS) — iOS 사파리는 `user-scalable=no` 를 **무시한다**(iOS 10~).
   *    핀치 줌은 이 비표준 이벤트를 막아야 확실히 죽는다.
   * 3. `contextmenu` — 길게 누르면 뜨는 메뉴. 스틱을 오래 붙잡고 있으면 튀어나온다.
   */
  suppressBrowserGestures(): void {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async lockLandscape(): Promise<void> {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?(o: string): Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // 데스크톱 브라우저·전체화면 아닌 상태에서는 거부된다. 정상이다.
    }
  }

  async keepAwake(on: boolean): Promise<void> {
    try {
      if (on) {
        const wl = navigator as Navigator & {
          wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> };
        };
        this.wakeLock = (await wl.wakeLock?.request('screen')) ?? null;
      } else {
        await this.wakeLock?.release();
        this.wakeLock = null;
      }
    } catch {
      /* 미지원 */
    }
  }

  safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
    const read = (name: string): number => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return Number.parseFloat(v) || 0;
    };
    return {
      top: read('--sat'),
      right: read('--sar'),
      bottom: read('--sab'),
      left: read('--sal'),
    };
  }
}
