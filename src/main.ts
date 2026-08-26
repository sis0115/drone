import { FpvRenderer } from '@/render/Renderer';
import { buildWorld } from '@/world/SceneBuilder';
import { SignalModel } from '@/core/SignalModel';
import { DEFAULT as POSTFX } from '@/data/postfx';
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
const world = buildWorld();
const renderer = new FpvRenderer(canvas, world.scene);
const signal = new SignalModel();
const hud = new Hud(hudRoot);
const boot = new BootScreen(bootRoot);

// T2: 씬이 들어왔다. 비행은 T3 이므로 카메라를 고정한다.
//
// 고도 18m 는 아케이드 모드의 기본 유지 고도이고, 프로토타입이 실제로 보여 주는 시점이다.
// 지면 가까이(2m)에 두면 풀 빌보드 오버드로가 폭발해 **성능이 20배 느려진다**(실측) —
// 이식 결과를 프로토타입과 같은 조건에서 비교하려면 이 고도여야 한다.
renderer.camera.position.set(0, world.heightAt(0, 0) + 18, 0);
renderer.camera.rotation.set(0, Math.PI, 0, 'YXZ'); // 프로토타입 스폰 yaw 와 동일
renderer.setParams(POSTFX);

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
    boot.set(time.wall / BOOT_SEC);
    if (time.wall >= BOOT_SEC) {
      boot.hide();
      state.screen = 'ingame';
      debug.ready = true;
      bus.emit('link:established');
    }
  }

  // 신호 품질: 거리 + LOS 차폐 + 재밍 → 단일 변수. 후처리가 이걸 읽는다.
  const cam = renderer.camera.position;
  signal.update(
    {
      distance: Math.hypot(cam.x, cam.z),
      losBlocked: 0, // LOS 레이캐스트는 T3(비행)에서 붙는다
      jammed: false,
      falloff: POSTFX.falloff,
    },
    dt,
    POSTFX.freezeAmt,
  );
  state.signalQuality = signal.quality;
  renderer.uniforms.uBurst.value = signal.burst;
  // 프리즈 프레임에는 rtPrev 를 갱신하지 않는다 = 이전 프레임이 그대로 남는다.
  renderer.freeze = signal.frozen;
  renderer.uniforms.uFreeze.value = signal.frozen ? 1 : 0;
  renderer.uniforms.uThermal.value = state.camMode === 'thermal' ? 2 : state.camMode === 'color' ? 1 : 0;

  // 풀 흔들림
  if (world.vegetation.windUniform) world.vegetation.windUniform.value = time.elapsed;

  renderer.render(time.elapsed, state.signalQuality);
  hud.update(time.fps, state.signalQuality);
}

bus.once('boot:ready', () => console.info('[slfpv] boot ready'));
requestAnimationFrame((t) => {
  time.reset(t);
  bus.emit('boot:ready');
  requestAnimationFrame(loop);
});
