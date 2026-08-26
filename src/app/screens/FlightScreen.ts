import { Vector3 } from 'three';
import type { ScreenName } from '@/core/GameState';
import { buildWorld, type World } from '@/world/SceneBuilder';
import { SignalModel } from '@/core/SignalModel';
import { LineOfSight } from '@/core/LineOfSight';
import { ArcadeFlight } from '@/drone/ArcadeFlight';
import { ProFlight } from '@/drone/ProFlight';
import { Wind } from '@/drone/Wind';
import { Battery } from '@/drone/Battery';
import type { CrashReason, FlightContext, FlightModel } from '@/drone/FlightModel';
import { DEFAULT as POSTFX } from '@/data/postfx';
import { Hud } from '@/ui/Hud';
import { TargetOverlay } from '@/ui/TargetOverlay';
import { updateTargets } from '@/world/Targets';
import { PadOverlay } from '@/ui/PadOverlay';
import type { InputFrame } from '@/input/InputSource';
import type { AppContext, Screen } from '../Screen';

/**
 * 인게임 — 월드 + 비행 + 신호 + 배터리.
 *
 * 이 화면이 인게임 시뮬레이션 전체를 소유한다. 미션 목표·표적·위협은
 * T7(위협) · T8(미션 러너) 에서 **여기에 얹히는 게 아니라 옆에 붙는다** —
 * 이 파일이 다시 만능 파일이 되지 않도록 `mission/` 이 별도 시스템으로 들어온다.
 */
export class FlightScreen implements Screen {
  readonly name: ScreenName = 'flight';

  private ctx!: AppContext;
  private world!: World;
  private hud!: Hud;
  private hudRoot!: HTMLElement;
  private pads: PadOverlay | null = null;
  private targets: TargetOverlay | null = null;
  private elapsed = 0;

  private readonly signal = new SignalModel();
  private readonly los = new LineOfSight();
  private readonly battery = new Battery();
  private wind!: Wind;

  private models!: Record<'arcade' | 'pro', FlightModel>;
  private flight!: FlightModel;
  private crashReason: CrashReason | null = null;
  private spawnPoint!: Vector3;

  enter(ctx: AppContext): void {
    this.ctx = ctx;

    this.world = buildWorld();
    ctx.renderer.scene = this.world.scene;
    ctx.renderer.setParams(POSTFX);

    // 돌풍은 예고된다 (GDD 4.5 규칙 1). 알림은 EventBus 로만 — 화면이 UI 를 직접 부르지 않는다.
    this.wind = new Wind((strength) => ctx.bus.emit('wind:gust', { strength }));

    const flightCtx: FlightContext = {
      heightAt: (x, z) => this.world.heightAt(x, z),
      obstacles: this.world.obstacles,
      wind: this.wind,
      onCrash: (reason) => this.crash(reason),
    };
    this.models = {
      arcade: new ArcadeFlight(flightCtx),
      pro: new ProFlight(flightCtx),
    };
    this.flight = this.models[ctx.state.flightMode];

    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'hud';
    ctx.overlay.appendChild(this.hudRoot);
    this.hud = new Hud(this.hudRoot);
    this.targets = new TargetOverlay(this.hudRoot);

    // 가상 패드 — 폰에서 이게 없으면 조작 자체가 불가능하다 (GDD 7장).
    if (ctx.touch) this.pads = new PadOverlay(this.hudRoot, ctx.touch);

    this.spawnPoint = new Vector3(0, this.world.heightAt(0, 0) + 0.6, 0);
    this.spawn();

    void ctx.platform.keepAwake(true);
    void ctx.platform.lockLandscape();
  }

  exit(): void {
    this.pads?.dispose();
    this.pads = null;
    this.targets?.dispose();
    this.targets = null;
    this.hud.dispose();
    this.hudRoot.remove();
    void this.ctx.platform.keepAwake(false);
  }

  update(dt: number, input: InputFrame): void {
    const { renderer, state, time } = this.ctx;

    this.elapsed += dt;
    updateTargets(this.world.targets, dt);

    if (!this.crashReason) {
      this.wind.update(dt);
      this.flight.step(input, dt);
      // 기동 강도에 비례해 배터리가 닳는다 (GDD 4장).
      const load = this.flight.mode === 'arcade' ? Math.abs(input.pitch) * 0.9 : 1;
      this.battery.drain(dt, load);
      if (this.battery.empty) this.crash('배터리 소진');
    }

    const t = this.flight.telemetry;
    this.followCamera();
    this.followSun();

    // 신호 품질: 거리 + LOS 차폐 + 재밍 → 단일 변수. 후처리 전체가 이걸 읽는다.
    this.los.update(t.pos, this.world.obstacles);
    this.signal.update(
      {
        distance: Math.hypot(t.pos.x, t.pos.z),
        losBlocked: this.los.blocked,
        jammed: false, // 재밍은 T7 위협 프레임워크에서 붙는다
        falloff: POSTFX.falloff,
      },
      dt,
      POSTFX.freezeAmt,
    );
    state.signalQuality = this.signal.quality;

    const u = renderer.uniforms;
    u.uBurst.value = this.signal.burst;
    u.uFreeze.value = this.signal.frozen ? 1 : 0;
    renderer.freeze = this.signal.frozen;
    u.uShake.value.set(this.flight.shake.x, this.flight.shake.y);
    // 젤로(모터 진동)·모션블러는 속도에 비례한다.
    u.uJello.value = Math.min(1, t.spd / 20);
    u.uMotion.value = Math.min(1, t.spd / 26);
    u.uThermal.value = state.camMode === 'thermal' ? 2 : state.camMode === 'color' ? 1 : 0;

    if (this.world.vegetation.windUniform) {
      this.world.vegetation.windUniform.value = time.elapsed;
    }

    this.hud.update({
      fps: time.fps,
      signal: this.signal.quality,
      burst: this.signal.burst,
      batteryPercent: this.battery.level,
      altitude: t.agl,
      speed: t.spd * 3.6,
      // 아케이드만 목표 고도가 있다 — 프로는 조종사가 직접 잡는다
      targetAltitude: this.flight.targetAltitude ?? null,
      camMode: state.camMode.toUpperCase(),
      losBlocked: this.los.blocked > 0.5,
      linkDown: this.crashReason !== null,
      elapsedSec: this.elapsed,
      build: `${__BUILD_BRANCH__} ${__BUILD_ID__}`,
    });
    // 왜곡 계수는 셰이더가 받은 그 값을 그대로 넘긴다 (07 문서 2.4)
    this.targets?.update(this.world.targets, renderer.camera, t.pos, renderer.params.distort);
    this.pads?.update();
  }

  private followCamera(): void {
    const cam = this.ctx.renderer.camera;
    const t = this.flight.telemetry;
    cam.position.copy(t.pos);
    cam.rotation.set(0, 0, 0);
    cam.rotateY(t.yaw);
    // 프로 모드는 기체 기울기가 화면에 실린다 — 아케이드보다 덜 실어 멀미를 줄인다.
    const lean = this.flight.mode === 'pro' ? 0.85 : 1;
    cam.rotateX(t.pitch * lean);
    cam.rotateZ(-t.roll * lean);
  }

  /** 섀도우 카메라가 ±110m 뿐이라 태양이 기체를 따라다녀야 한다. */
  private followSun(): void {
    const { sun } = this.world;
    const t = this.flight.telemetry;
    const groundY = this.world.heightAt(t.pos.x, t.pos.z);
    sun.position.set(t.pos.x - 70, groundY + 100, t.pos.z + 50);
    sun.target.position.set(t.pos.x, groundY, t.pos.z);
    sun.target.updateMatrixWorld();
  }

  private crash(reason: CrashReason): void {
    if (this.crashReason) return;
    this.crashReason = reason;
    this.ctx.renderer.uniforms.uDead.value = 1;
    this.ctx.platform.vibrate([90, 60, 140]);
    this.ctx.bus.emit('flight:crashed', { reason });
  }

  // ── 디버그·테스트용 표면 ──

  spawn(): void {
    this.elapsed = 0;
    this.crashReason = null;
    this.ctx.renderer.uniforms.uDead.value = 0;
    this.battery.reset();
    this.signal.reset();
    this.los.reset();
    for (const m of Object.values(this.models)) m.reset(this.spawnPoint, Math.PI);
    this.ctx.bus.emit('flight:spawned');
  }

  setMode(mode: 'arcade' | 'pro'): void {
    const previous = this.flight.telemetry;
    this.ctx.state.flightMode = mode;
    this.flight = this.models[mode];
    // 모드를 바꿔도 기체가 순간이동하지 않게 상태를 넘긴다.
    this.flight.telemetry.pos.copy(previous.pos);
    this.flight.telemetry.vel.copy(previous.vel);
    this.flight.telemetry.yaw = previous.yaw;
    this.ctx.bus.emit('flight:mode-changed', { mode });
  }

  get telemetry() {
    return this.flight.telemetry;
  }
  get batteryLevel(): number {
    return this.battery.level;
  }
  get crashed(): string | null {
    return this.crashReason;
  }
  calmWind(): void {
    this.wind.calm();
  }
  get renderInfo(): { calls: number; triangles: number } {
    return this.ctx.renderer.info;
  }
}
