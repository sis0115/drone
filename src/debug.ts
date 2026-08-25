import type { DroneTelemetry } from '@/drone/FlightModel';
import type { InputFrame, InputSource } from '@/input/InputSource';
import { ScriptedInputSource } from '@/input/InputSource';

/**
 * Playwright가 붙잡는 검증 훅 (02 문서 3.2).
 * 좌표·속도·fps를 노출하고, 스크립트 입력을 사람 입력과 같은 자리에 꽂는다.
 * 프로덕션 빌드에서도 남긴다 — 실기 폰에서 콘솔로 수치를 확인해야 하기 때문.
 */
export interface DebugApi {
  state: Record<string, unknown>;
  drone: { pos: [number, number, number]; vel: [number, number, number]; agl: number; spd: number };
  fps: number;
  frame: number;
  mission: string | null;
  render: { calls: number; triangles: number };
  errors: string[];
  ready: boolean;
  setInput(fn: ((elapsed: number, dt: number) => Partial<InputFrame>) | null): void;
}

declare global {
  interface Window {
    __debug: DebugApi;
  }
}

const ZERO3: [number, number, number] = [0, 0, 0];

export interface DebugHost {
  snapshot(): Record<string, unknown>;
  telemetry(): DroneTelemetry | null;
  renderInfo(): { calls: number; triangles: number };
  fps(): number;
  frame(): number;
  missionId(): string | null;
  setInputSource(source: InputSource | null): void;
}

export function installDebug(host: DebugHost): DebugApi {
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  const api: DebugApi = {
    get state() {
      return host.snapshot();
    },
    get drone() {
      const t = host.telemetry();
      if (!t) return { pos: ZERO3, vel: ZERO3, agl: 0, spd: 0 };
      return {
        pos: [t.pos.x, t.pos.y, t.pos.z] as [number, number, number],
        vel: [t.vel.x, t.vel.y, t.vel.z] as [number, number, number],
        agl: t.agl,
        spd: t.spd,
      };
    },
    get fps() {
      return host.fps();
    },
    get frame() {
      return host.frame();
    },
    get mission() {
      return host.missionId();
    },
    get render() {
      return host.renderInfo();
    },
    errors,
    ready: false,
    setInput(fn) {
      host.setInputSource(fn ? new ScriptedInputSource(fn) : null);
    },
  };

  window.__debug = api;
  return api;
}
