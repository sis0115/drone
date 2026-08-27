import { Vector3 } from 'three';
import type { CamMode, ScreenName } from '@/core/GameState';
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
import { ThreatOverlay } from '@/ui/ThreatOverlay';
import { ThreatRunner, type ThreatFrame } from '@/mission/threats/ThreatRunner';
import { buildThreats } from '@/mission/buildThreats';
import { MissionRunner } from '@/mission/MissionRunner';
import { M2_1 } from '@/data/missions';
import { frameById } from '@/data/frames';
import { destroyTarget, updateTargets } from '@/world/Targets';
import { findImpact } from '@/mission/Strike';
import { AoLimit, type AoState } from '@/mission/AoLimit';
import { save } from '@/core/Save';
import { CAM_MODE_LABEL, THERMAL_UNIFORM, applyCameraMode, nextCamMode } from '@/world/CameraMode';
import { PadOverlay } from '@/ui/PadOverlay';
import type { InputFrame } from '@/input/InputSource';
import { t as tr } from '@/i18n';
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
  private threatMarkers: ThreatOverlay | null = null;
  private elapsed = 0;

  private readonly signal = new SignalModel();
  private readonly los = new LineOfSight();
  private readonly battery = new Battery();
  private wind!: Wind;
  private threats!: ThreatRunner;
  private threatFrame: ThreatFrame = { jam: 0, kill: null, warning: null, warnings: [] };
  /** 이번 출격에서 자폭 돌입이 성립했는가 — HUD 가 NO LINK 대신 TGT DOWN 을 띄운다 */
  private struck = false;
  private mission!: MissionRunner;
  /** crash 후 디브리핑 전환까지의 벽시계 기준점 */
  private crashedAtWall: number | null = null;
  /** 출격당 1회성 무전 — 반복되는 무전은 잔소리다 */
  private saidNav = false;
  private saidThreat = false;
  private saidAo = false;
  private readonly ao = new AoLimit();
  private aoState: AoState = { outside: false, progress: 0, secondsLeft: 3, distanceToEdge: 1e9, warning: false };

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
    // 기체 성능 — 격납고에서 고른 기체의 배터리 배율 (05 문서 4.5)
    this.battery.capacityMult = frameById(ctx.state.profile?.loadout.frame ?? 'frame.sparrow7').batteryMult;

    // 어시스트가 비행 모델을 정한다 (GDD 7장): full=아케이드 / semi=프로 앵글 / acro=프로 레이트
    const assist = (ctx.state.profile?.settings.assist ?? 'full') as 'full' | 'semi' | 'acro';
    this.models = {
      arcade: new ArcadeFlight(flightCtx),
      pro: new ProFlight(flightCtx, assist === 'acro' ? 'acro' : 'semi'),
    };
    ctx.state.flightMode = assist === 'full' ? 'arcade' : 'pro';
    this.flight = this.models[ctx.state.flightMode];

    // 위협 배치는 미션 정의가 갖는다 (T8c) — 여기서는 감각 입력을 주고 결과를 받을 뿐이다.
    this.mission = new MissionRunner(M2_1);
    this.threats = new ThreatRunner(
      buildThreats(M2_1.threats, (x: number, z: number) => this.world.heightAt(x, z)),
    );

    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'ingame';
    ctx.overlay.appendChild(this.hudRoot);
    this.hud = new Hud(this.hudRoot);
    this.targets = new TargetOverlay(this.hudRoot);
    this.threatMarkers = new ThreatOverlay(this.hudRoot);
    this.hud.onCamCycle(() => this.cycleCamMode());
    // 데스크톱 단축키: C = 카메라 모드, M = 비행 모드
    ctx.onKeyAction((code) => {
      if (code === 'KeyC') this.cycleCamMode();
      if (code === 'KeyM') this.setMode(this.flight.mode === 'arcade' ? 'pro' : 'arcade');
    });
    applyCameraMode(this.world, ctx.state.camMode);

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
    this.threatMarkers?.dispose();
    this.threatMarkers = null;
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

    // 위협 → 신호 순서가 중요하다. 재밍 감쇠가 같은 프레임의 신호 계산에 실려야
    // 돔 경계에서 화면이 한 프레임 늦게 무너지지 않는다.
    if (!this.crashReason) this.updateThreats(dt, t.agl, t.spd);

    // 작전 구역 — 이탈하면 벽이 아니라 신호가 막는다 (T8b). 3초에 걸쳐 링크가 무너진다.
    if (!this.crashReason) {
      this.aoState = this.ao.update(t.pos.x, t.pos.z, dt);
      if (this.aoState.outside && !this.saidAo) {
        this.saidAo = true;
        this.hud.radio(tr('radio.ao.warn'));
      }
      if (this.ao.expired) this.crash('작전 구역 이탈');
    }

    // 자폭 돌입 — 무장이 아니라 기체가 탄이다 (T8a). 판정 수식은 프로토타입 그대로.
    if (!this.crashReason) {
      const impact = findImpact(t.pos, this.world.targets, this.flight.mode);
      if (impact) {
        destroyTarget(impact.target, this.world.registry, state.camMode === 'thermal');
        this.struck = true;
        this.mission.onStrike();
        this.ctx.bus.emit('strike:hit', {
          distance: impact.distance,
          speed: t.spd,
          targetsLeft: this.world.targets.filter((x) => x.alive).length,
        });
        // 기폭 진동은 격추 진동과 달라야 한다 — 한 방
        this.ctx.platform.vibrate([220]);
        this.crash('자폭 돌입');
      }
    }

    this.followCamera();
    this.followSun();

    // 신호 품질: 거리 + LOS 차폐 + 재밍 → 단일 변수. 후처리 전체가 이걸 읽는다.
    this.los.update(t.pos, this.world.obstacles);
    this.signal.update(
      {
        distance: Math.hypot(t.pos.x, t.pos.z),
        losBlocked: this.los.blocked,
        // 이탈 진행이 재밍처럼 신호를 깎는다 — 화면이 점점 무너지다 끊기는 연출의 근거
        jam: Math.max(this.threatFrame.jam, this.aoState.outside ? 0.35 + this.aoState.progress * 0.65 : 0),
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
    u.uThermal.value = THERMAL_UNIFORM[state.camMode];

    if (this.world.vegetation.windUniform) {
      this.world.vegetation.windUniform.value = time.elapsed;
    }

    // SIGNAL LOST 정지 화면을 잠시 보여준 뒤 디브리핑으로 (GDD 4장 시그니처의 마지막 단).
    // 벽시계다 — 저사양에서 시뮬 시간을 쓰면 이 2.5초가 수십 초가 된다(부트 게이트와 같은 함정).
    if (this.crashedAtWall !== null && time.wall - this.crashedAtWall > 2.5) {
      this.crashedAtWall = null;
      this.ctx.go('debrief');
      return;
    }

    // 항법 무전 — 이륙 3초 뒤 한 번. 첫 판의 "어디로?"를 없앤다
    if (!this.saidNav && this.elapsed > 3 && !this.crashReason) {
      this.saidNav = true;
      this.hud.radio(tr('radio.m2.nav'));
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
      camMode: CAM_MODE_LABEL[state.camMode],
      threat: this.threatFrame.warning
        ? {
            token: this.threatFrame.warning.id,
            distance: this.threatFrame.warning.distance,
            armed: this.threatFrame.warning.armed,
            lethal: this.threatFrame.warning.lethal,
            aiming: this.threatFrame.warning.kind === 'aim',
          }
        : null,
      losBlocked: this.los.blocked > 0.5,
      linkDown: this.crashReason !== null,
      struck: this.struck,
      ao: this.aoState.warning
        ? {
            outside: this.aoState.outside,
            secondsLeft: this.aoState.secondsLeft,
            distance: Math.max(0, this.aoState.distanceToEdge),
          }
        : null,
      elapsedSec: this.elapsed,
      build: `${__BUILD_BRANCH__} ${__BUILD_ID__}`,
      objective: { kills: this.mission.killCount, goal: this.mission.def.destroyGoal },
    });
    // 왜곡 계수는 셰이더가 받은 그 값을 그대로 넘긴다 (07 문서 2.4)
    this.targets?.update(this.world.targets, renderer.camera, t.pos, renderer.params.distort);
    this.threatMarkers?.update(this.threats.threats, renderer.camera, renderer.params.distort);
    this.pads?.update();
  }

  /**
   * 위협 갱신. 예고 전이만 EventBus 로 알린다 — 매 프레임 쏘면 로그가 잠긴다.
   * 격추 판정은 러너가 0.5초 계약을 통과시킨 것만 온다 (GDD 4.5 규칙 1).
   */
  private updateThreats(dt: number, agl: number, speed: number): void {
    const previous = this.threatFrame.warning;
    const frame = this.threats.update({ pos: this.flight.telemetry.pos, agl, speed, dt });
    this.threatFrame = frame;

    const bus = this.ctx.bus;
    const now = frame.warning;
    if (now && (!previous || previous.id !== now.id || previous.kind !== now.kind || previous.armed !== now.armed)) {
      bus.emit('threat:telegraph', {
        id: now.id, kind: now.kind, progress: now.progress, distance: now.distance, armed: now.armed,
      });
      // 조준이 걸리면 손으로도 알린다. 폰에서는 이쪽이 더 빨리 읽힌다
      if (now.kind === 'aim') {
        this.ctx.platform.vibrate([40]);
        if (!this.saidThreat) {
          this.saidThreat = true;
          this.hud.radio(tr('radio.threat.a1'));
        }
      }
    } else if (!now && previous) {
      bus.emit('threat:cleared', { id: previous.id });
    }

    if (frame.kill) {
      this.mission.onThreatHit({
        causeKey: frame.kill.causeKey,
        agl: frame.kill.agl,
        adviceKey: frame.kill.adviceKey,
        adviceParams: frame.kill.adviceParams,
      });
      bus.emit('threat:hit', {
        id: frame.kill.threatId,
        causeKey: frame.kill.causeKey,
        agl: frame.kill.agl,
        adviceKey: frame.kill.adviceKey,
        adviceParams: frame.kill.adviceParams,
      });
      this.crash('피격');
    }
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
    this.crashedAtWall = this.ctx.time.wall;
    this.ctx.renderer.uniforms.uDead.value = 1;
    this.ctx.platform.vibrate([90, 60, 140]);
    this.ctx.bus.emit('flight:crashed', { reason });
    // 출격 종료 확정 — 자폭 드론이라 모든 출격은 손실로 끝난다 (T8c)
    const profile = this.ctx.state.profile;
    // 최초 완수 여부는 프로필이 안다 — 러너에 알려 줘야 첫 실적 보너스가 갈린다
    const alreadyCleared = profile?.campaign[this.mission.def.id]?.cleared ?? false;
    const debrief = this.mission.finish(reason, this.elapsed, alreadyCleared);
    // SP 지급 + 전적 + 저장 — 저장 시점은 "디브리핑 확정"이다 (05 문서 1장)
    if (profile) {
      profile.sp += debrief.spEarned;
      profile.stats.totalKills += debrief.kills;
      profile.stats.framesLost += 1;
      profile.stats.flightTimeSec += debrief.flightSec;
      if (debrief.cleared) {
        const entry = profile.campaign[debrief.missionId] ?? { stars: 0, cleared: false };
        entry.cleared = true;
        entry.stars = Math.max(entry.stars, 1); // ★2·★3 조건은 v0.3
        profile.campaign[debrief.missionId] = entry;
      }
      debrief.spTotal = profile.sp;
      save(profile);
      if (debrief.spEarned > 0) {
        this.ctx.bus.emit('sp:changed', { sp: profile.sp, delta: debrief.spEarned });
      }
    }
    this.ctx.state.debrief = debrief;
    this.ctx.bus.emit('mission:ended', { missionId: debrief.missionId, cleared: debrief.cleared });
  }

  // ── 디버그·테스트용 표면 ──

  spawn(): void {
    this.elapsed = 0;
    this.crashReason = null;
    // 격파된 표적은 리스폰해도 남는다 — 미션 재시작(T8c)이 월드를 새로 짓는다
    this.struck = false;
    this.ctx.renderer.uniforms.uDead.value = 0;
    this.battery.reset();
    this.signal.reset();
    this.los.reset();
    this.threats.reset();
    this.threatFrame = { jam: 0, kill: null, warning: null, warnings: [] };
    this.ao.reset();
    this.aoState = { outside: false, progress: 0, secondsLeft: 3, distanceToEdge: 1e9, warning: false };
    this.crashedAtWall = null;
    this.saidNav = false;
    this.saidThreat = false;
    this.saidAo = false;
    this.mission.reset();
    // 스폰 방향은 표적 종대 쪽(남동) — π(북쪽)로 뒀더니 첫 판이 등 뒤의 전장을 못 찾았다.
    // forward = (-sin yaw, -cos yaw) 이므로 목표 벡터 (120,-220) 에 대해 atan2(-x, -z).
    for (const m of Object.values(this.models)) m.reset(this.spawnPoint, Math.atan2(-120, 220));
    this.ctx.bus.emit('flight:spawned');
  }

  /** 흑백 → 컬러 → 열화상 순환 (GDD 4장 시야 제약 / 06 문서 1.1). */
  cycleCamMode(): void {
    this.setCamMode(nextCamMode(this.ctx.state.camMode));
  }

  setCamMode(mode: CamMode): void {
    this.ctx.state.camMode = mode;
    applyCameraMode(this.world, mode);
    this.ctx.bus.emit('cam:mode-changed', { mode });
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
  /** 테스트·점검용 — 배터리 잔량을 직접 세운다 */
  setBattery(percent: number): void {
    this.battery.set(percent);
  }
  calmWind(): void {
    this.wind.calm();
  }
  /** 테스트·디버그 — 위협 프레임과 계약 위반 기록 */
  get threatState(): {
    warning: ThreatFrame['warning'];
    warnings: ThreatFrame['warnings'];
    jam: number;
    violations: readonly string[];
  } {
    return {
      warning: this.threatFrame.warning,
      warnings: this.threatFrame.warnings,
      jam: this.threatFrame.jam,
      violations: this.threats.violations,
    };
  }
  /** 테스트·디버그 — 작전 구역 상태 */
  get aoLimitState(): AoState {
    return this.aoState;
  }
  /** 테스트·디버그 — 표적 좌표 (자동조종 플레이스루용) */
  get targetPositions(): { x: number; z: number; alive: boolean }[] {
    return this.world.targets.map((t) => ({
      x: t.group.position.x,
      z: t.group.position.z,
      alive: t.alive,
    }));
  }
  /** 테스트·디버그 — 자폭 결과 */
  get strikeState(): { struck: boolean; targetsAlive: number } {
    return { struck: this.struck, targetsAlive: this.world.targets.filter((x) => x.alive).length };
  }
  get renderInfo(): { calls: number; triangles: number } {
    return this.ctx.renderer.info;
  }
}
