import type { App } from '@/app/App';
import type { FlightScreen } from '@/app/screens/FlightScreen';
import type { DroneTelemetry } from '@/drone/FlightModel';
import { ScriptedInputSource, type InputFrame } from '@/input/InputSource';
import { bus } from '@/core/EventBus';
import { state } from '@/core/GameState';

/**
 * Playwright 가 붙잡는 검증 훅 (02 문서 3.2).
 * 좌표·속도·fps 를 노출하고, 스크립트 입력을 사람 입력과 같은 자리에 꽂는다.
 * 프로덕션 빌드에도 남긴다 — 실기 폰에서 콘솔로 수치를 봐야 하기 때문.
 */
export interface DebugApi {
  state: Record<string, unknown>;
  drone: { pos: [number, number, number]; vel: [number, number, number]; agl: number; spd: number };
  fps: number;
  frame: number;
  screen: string;
  render: { calls: number; triangles: number };
  build: { id: string; branch: string };
  errors: string[];
  ready: boolean;
  setInput(fn: ((elapsed: number, dt: number) => Partial<InputFrame>) | null): void;
  flight: FlightDebugApi;
}

interface ThreatWarningView {
  id: string;
  kind: string;
  progress: number;
  distance: number;
  elapsed: number;
  armed: boolean;
}

export interface FlightDebugApi {
  mode(): 'arcade' | 'pro';
  setMode(mode: 'arcade' | 'pro'): void;
  telemetry(): DroneTelemetry;
  battery(): number;
  /** 잔량을 직접 세운다 — 저전압 화면을 실시간으로 기다리지 않기 위해 */
  setBattery(percent: number): void;
  /** 자폭 결과 — 성립 여부와 생존 표적 수 */
  strike(): { struck: boolean; targetsAlive: number };
  /** 작전 구역 상태 */
  ao(): { outside: boolean; progress: number; secondsLeft: number; distanceToEdge: number; warning: boolean };
  crashed(): string | null;
  respawn(): void;
  camMode(): string;
  /** 위협 상태 — 예고 하나 + 재밍 강도 + 계약 위반 기록 (GDD 4.5 규칙 1) */
  threats(): {
    warning: ThreatWarningView | null;
    /** 예고 중인 위협 전부 — HUD 는 하나만 고르지만 테스트는 전부 본다 */
    warnings: ThreatWarningView[];
    jam: number;
    violations: readonly string[];
  };
  setCamMode(mode: 'bw' | 'color' | 'thermal'): void;
  cycleCamMode(): void;
  /** 테스트 재현성을 위해 바람을 끈다. */
  setWindCalm(): void;
}

declare global {
  interface Window {
    __debug: DebugApi;
  }
}

const ZERO3: [number, number, number] = [0, 0, 0];

export function installDebug(app: App, flight: FlightScreen): DebugApi {
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  const inFlight = (): boolean => app.screen?.name === 'flight';

  const api: DebugApi = {
    get state() {
      return { ...state.snapshot(), input: app.input };
    },
    get drone() {
      if (!inFlight()) return { pos: ZERO3, vel: ZERO3, agl: 0, spd: 0 };
      const t = flight.telemetry;
      return {
        pos: [t.pos.x, t.pos.y, t.pos.z] as [number, number, number],
        vel: [t.vel.x, t.vel.y, t.vel.z] as [number, number, number],
        agl: t.agl,
        spd: t.spd,
      };
    },
    get fps() {
      return app.time.fps;
    },
    get frame() {
      return app.time.frame;
    },
    get screen() {
      return app.screen?.name ?? 'none';
    },
    get render() {
      return app.renderer.info;
    },
    build: { id: __BUILD_ID__, branch: __BUILD_BRANCH__ },
    errors,
    ready: false,
    setInput(fn) {
      app.setInputSource(fn ? new ScriptedInputSource(fn) : null);
    },
    flight: {
      mode: () => state.flightMode,
      setMode: (m) => flight.setMode(m),
      telemetry: () => flight.telemetry,
      battery: () => flight.batteryLevel,
      crashed: () => flight.crashed,
      respawn: () => flight.spawn(),
      setBattery: (p) => flight.setBattery(p),
      strike: () => flight.strikeState,
      ao: () => flight.aoLimitState,
      camMode: () => state.camMode,
      threats: () => flight.threatState,
      setCamMode: (m) => flight.setCamMode(m),
      cycleCamMode: () => flight.cycleCamMode(),
      setWindCalm: () => flight.calmWind(),
    },
  };

  // 인게임에 들어선 순간을 준비 완료로 본다 — 테스트가 여기서 기다린다.
  bus.on('screen:changed', ({ to }) => {
    if (to === 'flight') api.ready = true;
  });

  window.__debug = api;
  return api;
}
