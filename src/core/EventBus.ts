/**
 * 시스템 간 직접 참조 금지 (02 문서 2장). 모든 교차 통신은 이 버스를 지난다.
 * 이벤트 이름은 `도메인:동사` 규칙.
 */
export interface GameEvents {
  'boot:ready': void;
  'link:established': void;
  'link:lost': { reason: string };
  'signal:changed': { quality: number };
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
