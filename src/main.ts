import * as THREE from 'three';
import { FpvRenderer } from '@/render/Renderer';
import { Time } from '@/core/Time';
import { state } from '@/core/GameState';
import { bus } from '@/core/EventBus';
import { load, save, type PlayerProfile } from '@/core/Save';
import * as Cloud from '@/core/CloudSave';
import { applyTheme } from '@/data/theme';
import { setLocale, type Locale } from '@/i18n';
import { Hud } from '@/ui/Hud';
import { BootScreen } from '@/ui/BootScreen';
import { CloudPanel, describeStatus } from '@/ui/CloudPanel';
import { KeyboardInput } from '@/input/KeyboardInput';
import { NullInputSource, type InputFrame, type InputSource } from '@/input/InputSource';
import { installDebug } from '@/debug';
import './style.css';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const bootRoot = document.getElementById('boot') as HTMLElement;

applyTheme();

state.profile = load();
setLocale(state.profile.settings.lang as Locale);

const time = new Time();
const renderer = new FpvRenderer(canvas);
const hud = new Hud(hudRoot);
const boot = new BootScreen(bootRoot);

// T1은 빈 화면이다. 지형·식생·소품은 T2에서 프로토타입을 모듈로 분해해 옮긴다.
renderer.scene.background = new THREE.Color(0x000000);
renderer.camera.position.set(0, 2, 0);

const cloudPanel = new CloudPanel(
  document.getElementById('app') as HTMLElement,
  () => state.profile!,
  (profile) => {
    // 이어받기로 프로필이 통째로 갈렸다 — 로컬에도 즉시 반영한다.
    state.profile = profile;
    save(profile);
  },
);

/**
 * 클라우드 동기화. 로컬 저장이 원본이고 이건 그 위에 얹은 계층이라,
 * 실패해도 게임은 그대로 간다.
 */
let lastSyncStatus = '';
async function syncCloud(): Promise<void> {
  if (!state.profile || !Cloud.isEnabled()) return;
  const { profile, status } = await Cloud.sync(state.profile);
  if (profile !== state.profile) {
    state.profile = profile;
    save(profile);
  }
  lastSyncStatus = describeStatus(status);
}

const keyboard = new KeyboardInput();
let scripted: InputSource | null = null;
let lastInput: InputFrame = new NullInputSource().sample();

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

hud.setMode(state.flightMode);
hud.onCloudClick(() => cloudPanel.open());

const debug = installDebug({
  snapshot: () => ({ ...state.snapshot(), input: lastInput }),
  telemetry: () => null, // 비행 모델은 T3
  renderInfo: () => renderer.info,
  fps: () => time.fps,
  frame: () => time.frame,
  missionId: () => null,
  setInputSource: (source) => {
    scripted = source;
  },
  cloud: {
    isEnabled: () => Cloud.isEnabled(),
    status: () => lastSyncStatus,
    openPanel: () => cloudPanel.open(),
    closePanel: () => cloudPanel.close(),
    sync: () => syncCloud(),
    enable: async () => {
      await Cloud.enable(state.profile as PlayerProfile);
    },
    createLinkCode: () => Cloud.createLinkCode(),
    claimLinkCode: async (code: string) => {
      const profile = await Cloud.claimLinkCode(code);
      state.profile = profile;
      save(profile);
    },
    reset: () => Cloud.clearCredential(),
    profile: () => state.profile,
  },
});

// 링크 접속 연출: 0.6초에 걸쳐 RSSI 게이지를 채운 뒤 부트 화면을 걷어낸다.
const BOOT_SEC = 0.6;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = time.tick(now);

  const source = scripted ?? keyboard;
  lastInput = source.sample(time.elapsed, dt);

  if (state.screen === 'boot') {
    boot.set(time.elapsed / BOOT_SEC);
    if (time.elapsed >= BOOT_SEC) {
      boot.hide();
      state.screen = 'ingame';
      debug.ready = true;
      bus.emit('link:established');
      // 부팅 직후 1회 동기화. 실패해도 게임 진행은 막지 않는다.
      void syncCloud();
    }
  }

  renderer.render(time.elapsed, state.signalQuality);
  hud.update(time.fps, state.signalQuality);
}

bus.once('boot:ready', () => console.info('[slfpv] boot ready'));
requestAnimationFrame((t) => {
  time.reset(t);
  bus.emit('boot:ready');
  requestAnimationFrame(loop);
});
