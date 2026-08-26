/**
 * 시스템 간 직접 참조 금지 (02 문서 2장). 모든 교차 통신은 이 버스를 지난다.
 * 이벤트 이름은 `도메인:동사` 규칙.
 */
export interface GameEvents {
  'app:ready': void;
  /** 화면 전환. UI 는 이걸 듣고 반응한다 — 화면끼리 직접 부르지 않는다. */
  'screen:changed': { from: string; to: string };
  'link:established': void;
  'link:lost': { reason: string };
  'flight:crashed': { reason: string };
  'flight:spawned': void;
  'flight:mode-changed': { mode: 'arcade' | 'pro' };
  'cam:mode-changed': { mode: 'bw' | 'color' | 'thermal' };
  /** 돌풍 예고 — GDD 4.5 규칙 1: 모든 위협은 예고된다. */
  'wind:gust': { strength: number };
  'signal:changed': { quality: number };
  /** 위협 예고 — GDD 4.5 규칙 1. `armed` 면 지금 격추가 성립하는 상태다 */
  'threat:telegraph': { id: string; kind: string; progress: number; distance: number; armed: boolean };
  /** 예고 해제 — 벗어났거나 재장전으로 내려갔다 */
  'threat:cleared': { id: string };
  /** 격추 성립. 디브리핑(T8)이 이 payload 로 원인 1줄을 만든다 */
  'threat:hit': {
    id: string; causeKey: string; agl: number; adviceKey: string; adviceParams: readonly number[];
  };
  'mission:started': { missionId: string };
  'mission:ended': { missionId: string; cleared: boolean };
  'sp:changed': { sp: number; delta: number };
  'locale:changed': { locale: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    const dispose = this.on(event, (payload) => {
      dispose();
      handler(payload);
    });
    return dispose;
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event as string)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(
    event: K,
    ...args: GameEvents[K] extends void ? [] : [GameEvents[K]]
  ): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    const payload = args[0] as GameEvents[K];
    // 핸들러가 구독을 해제해도 순회가 깨지지 않도록 복사본을 돈다.
    for (const handler of [...set]) (handler as Handler<GameEvents[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
