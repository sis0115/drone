import * as THREE from 'three';
import { FpvRenderer } from '@/render/Renderer';
import { Time } from '@/core/Time';
import { state } from '@/core/GameState';
import { bus } from '@/core/EventBus';
import { load } from '@/core/Save';
import { applyTheme } from '@/data/theme';
import { setLocale, type Locale } from '@/i18n';
import { Hud } from '@/ui/Hud';
import { BootScreen } from '@/ui/BootScreen';
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

const keyboard = new KeyboardInput();
let scripted: InputSource | null = null;
let lastInput: InputFrame = new NullInputSource().sample();

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

hud.setMode(state.flightMode);

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
