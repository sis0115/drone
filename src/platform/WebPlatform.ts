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
