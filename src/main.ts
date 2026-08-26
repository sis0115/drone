import { FpvRenderer } from '@/render/Renderer';
import { buildWorld } from '@/world/SceneBuilder';
import { SignalModel } from '@/core/SignalModel';
import { LineOfSight } from '@/core/LineOfSight';
import { ArcadeFlight } from '@/drone/ArcadeFlight';
import { ProFlight } from '@/drone/ProFlight';
import { Wind } from '@/drone/Wind';
import { Battery } from '@/drone/Battery';
import type { FlightContext, FlightModel } from '@/drone/FlightModel';
import { Vector3 } from 'three';
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
const los = new LineOfSight();
const battery = new Battery();

// 돌풍은 무전으로 예고된다 (GDD 4.5 규칙 1: 모든 위협은 예고된다).
const wind = new Wind(() => bus.emit('link:lost', { reason: 'gust' }));

const flightCtx: FlightContext = {
  heightAt: (x, z) => world.heightAt(x, z),
  obstacles: world.obstacles,
  wind,
  onCrash: (reason) => {
    if (crashed) return;
    crashed = reason;
    renderer.uniforms.uDead.value = 1;
  },
};

let crashed: string | null = null;
const models: Record<'arcade' | 'pro', FlightModel> = {
  arcade: new ArcadeFlight(flightCtx),
  pro: new ProFlight(flightCtx),
};
let flight: FlightModel = models[state.flightMode];

const SPAWN = new Vector3(0, world.heightAt(0, 0) + 0.6, 0);
function spawn(): void {
  crashed = null;
  renderer.uniforms.uDead.value = 0;
  battery.reset();
  signal.reset();
  los.reset();
  for (const m of Object.values(models)) m.reset(SPAWN, Math.PI);
}
spawn();

function setFlightMode(mode: 'arcade' | 'pro'): void {
  const previous = flight.telemetry;
  state.flightMode = mode;
  flight = models[mode];
  // 모드를 바꿔도 기체가 순간이동하지 않게 상태를 넘긴다.
  flight.telemetry.pos.copy(previous.pos);
  flight.telemetry.vel.copy(previous.vel);
  flight.telemetry.yaw = previous.yaw;
  hud.setMode(mode);
}
const hud = new Hud(hudRoot);
const boot = new BootScreen(bootRoot);

renderer.setParams(POSTFX);
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
  telemetry: () => flight.telemetry,
  renderInfo: () => renderer.info,
  fps: () => time.fps,
  frame: () => time.frame,
  missionId: () => null,
  setInputSource: (source) => {
    scripted = source;
  },
  flight: {
    mode: () => state.flightMode,
    setMode: setFlightMode,
    telemetry: () => flight.telemetry,
    battery: () => battery.level,
    crashed: () => crashed,
    respawn: spawn,
    setWindCalm: () => wind.calm(),
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

  // ── 비행 ──
  if (!crashed) {
    wind.update(dt);
    flight.step(lastInput, dt);
    const load = state.flightMode === 'arcade' ? Math.abs(lastInput.pitch) * 0.9 : 1;
    battery.drain(dt, load);
    if (battery.empty) flightCtx.onCrash?.('배터리 소진');
  }

  const t = flight.telemetry;
  // 카메라 = 기체 시점. 프로 모드는 기울기가 화면에 그대로 실린다.
  renderer.camera.position.copy(t.pos);
  renderer.camera.rotation.set(0, 0, 0);
  renderer.camera.rotateY(t.yaw);
  renderer.camera.rotateX(state.flightMode === 'pro' ? t.pitch * 0.85 : t.pitch);
  renderer.camera.rotateZ(state.flightMode === 'pro' ? -t.roll * 0.85 : -t.roll);

  // 그림자 카메라가 기체를 따라간다 — ±110m 밖은 그림자를 포기하는 설계라 필수다.
  world.sun.position.set(t.pos.x - 70, world.heightAt(t.pos.x, t.pos.z) + 100, t.pos.z + 50);
  world.sun.target.position.set(t.pos.x, world.heightAt(t.pos.x, t.pos.z), t.pos.z);
  world.sun.target.updateMatrixWorld();

  // 신호 품질: 거리 + LOS 차폐 + 재밍 → 단일 변수. 후처리가 이걸 읽는다.
  los.update(t.pos, world.obstacles);
  signal.update(
    {
      distance: Math.hypot(t.pos.x, t.pos.z),
      losBlocked: los.blocked,
      jammed: false, // 재밍은 T7 위협 프레임워크에서 붙는다
      falloff: POSTFX.falloff,
    },
    dt,
    POSTFX.freezeAmt,
  );
  renderer.uniforms.uShake.value.set(flight.shake.x, flight.shake.y);
  // 젤로(모터 진동)·모션블러는 속도에 비례한다.
  renderer.uniforms.uJello.value = Math.min(1, t.spd / 20);
  renderer.uniforms.uMotion.value = Math.min(1, t.spd / 26);
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
