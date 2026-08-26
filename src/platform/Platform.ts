/**
 * 플랫폼 추상화 — **웹 먼저, 나중에 모바일**의 구조적 분기점.
 *
 * 게임 코드는 이 인터페이스만 안다. 웹은 `WebPlatform`, Capacitor 로 감쌀 때는
 * `CapacitorPlatform` 을 끼우면 되고, **게임 로직은 한 줄도 바뀌지 않는다.**
 *
 * 왜 미리 만드나: 나중에 붙이려면 햅틱·저장·화면 잠금 호출이 코드 전역에 흩어진 뒤라
 * 전부 찾아 고쳐야 한다. 지금 통로를 하나로 좁혀 두는 비용이 훨씬 싸다.
 *
 * ⚠️ 여기에 게임 규칙을 넣지 말 것. **기기가 해 주는 일**만 담는다.
 */
export type PlatformTarget = 'web' | 'mobile' | 'steam';

export interface Platform {
  readonly target: PlatformTarget;

  /** 영구 저장. 웹=localStorage, 모바일=Preferences, Steam=파일. */
  readonly storage: KeyValueStorage;

  /** 피탄·돌풍·저전압 경고에 쓴다 (GDD 7장). 지원하지 않으면 조용히 무시. */
  vibrate(pattern: number | number[]): void;

  /** 가로 고정 (GDD 7장). 웹에서는 지원 브라우저에서만 걸린다. */
  lockLandscape(): Promise<void>;

  /** 인게임 중 화면이 꺼지지 않게. */
  keepAwake(on: boolean): Promise<void>;

  /** 노치·홈바 여백. CSS env() 값을 픽셀로. */
  safeAreaInsets(): { top: number; right: number; bottom: number; left: number };

  /**
   * 기체 재고제를 켤지 (GDD 6.6.3).
   * 모바일=켬 / Steam=끔. **설계 단계부터 분리하라고 문서가 명시한 항목이다.**
   */
  readonly usesFleetStock: boolean;
}

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}
