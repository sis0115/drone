import type { Platform } from './Platform';
import { WebPlatform } from './WebPlatform';

export type { Platform, PlatformTarget, KeyValueStorage } from './Platform';

let current: Platform = new WebPlatform();

/**
 * Capacitor 로 감쌀 때 여기서 구현을 갈아 끼운다.
 * 게임 코드는 `platform()` 만 부르므로 호출부는 손대지 않는다.
 */
export function setPlatform(p: Platform): void {
  current = p;
}

export function platform(): Platform {
  return current;
}
