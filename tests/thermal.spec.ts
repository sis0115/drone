import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { buildWorld } from '../src/world/SceneBuilder';
import { applyCameraMode, nextCamMode, CAM_MODE_ORDER, THERMAL_UNIFORM } from '../src/world/CameraMode';
import { HEAT } from '../src/data/thermal';
import { installDomStubs } from '../tools/dom-stub.mjs';
import type { CamMode } from '../src/core/GameState';

/**
 * 열화상 — **머티리얼 스왑**이지 셰이더 리맵이 아니다 (07 문서 2.3).
 *
 * 셰이더 밝기 리맵으로는 "하늘 흑 / 물 흑 / 지면 명 / 열원 백열"의 4단 구조가 나오지 않는다.
 * 오브젝트마다 열값을 부여해 두고 모드 전환 때 머티리얼을 교체하는 구조를 지킨다.
 */
installDomStubs();

test('열값 테이블이 4단 구조를 만든다 (06 문서 1.1)', () => {
  // 하늘·물이 가장 어둡고, 열원이 가장 밝다. 이 순서가 깨지면 열화상이 아니다.
  expect(HEAT.sky).toBeLessThan(0.1);
  expect(HEAT.water).toBeLessThan(0.2);
  expect(HEAT.ground).toBeGreaterThan(HEAT.water);
  expect(HEAT.ground).toBeGreaterThan(HEAT.canopy);
  expect(HEAT.truckEngine).toBeGreaterThan(0.9);
  // 트럭이 통째로 하얗게 뜨면 안 된다 — 엔진만 튀어야 한다
  expect(HEAT.truckEngine).toBeGreaterThan(HEAT.truckBed);
  expect(HEAT.truckBed).toBeGreaterThan(HEAT.truckWheel);
});

test('모드 전환이 실제로 머티리얼을 갈아 끼운다', () => {
  const world = buildWorld();
  expect(world.registry.pairs.length).toBeGreaterThan(50);

  const sample = world.registry.pairs[0];
  const normal = sample.mesh.material;

  applyCameraMode(world, 'thermal');
  expect(sample.mesh.material, '열화상인데 머티리얼이 그대로다').toBe(sample.thermal);
  // 전부 갈렸는지 — 하나라도 남으면 그 오브젝트만 컬러로 뜬다
  for (const p of world.registry.pairs) expect(p.mesh.material).toBe(p.thermal);

  applyCameraMode(world, 'color');
  expect(sample.mesh.material).toBe(normal);
  for (const p of world.registry.pairs) expect(p.mesh.material).toBe(p.normal);
});

test('트럭 엔진보다 뜨거운 오브젝트는 없다 — 열원이 하나뿐이어야 락온이 성립한다', () => {
  // 실제로 AO 패치가 색을 빠뜨려 백열(1,1,1)로 등록돼 있었다(DEVLOG 2026-08-26).
  // 등록 시 색을 안 주면 THREE.Color 기본값이 흰색이라 조용히 백열이 된다.
  const world = buildWorld();
  const max = Math.max(...Object.values(HEAT));
  for (const p of world.registry.pairs) {
    const c = (p.thermal as THREE.MeshBasicMaterial).color;
    expect(c.r, `열값 테이블(최대 ${max}) 밖의 밝기 ${c.r} 가 등록됐다`).toBeLessThanOrEqual(max + 1e-6);
  }
});

test('열화상 머티리얼의 밝기가 등록한 열값과 일치한다', () => {
  const world = buildWorld();
  const engine = world.registry.pairs.find(
    (p) => (p.thermal as THREE.MeshBasicMaterial).color.r > 0.95,
  );
  expect(engine, '백열(0.98) 로 등록된 오브젝트가 없다 — 트럭 엔진부가 빠졌나').toBeTruthy();

  const color = (engine!.thermal as THREE.MeshBasicMaterial).color;
  // 회색조여야 한다 — 색이 남으면 열화상이 아니다
  expect(color.r).toBeCloseTo(color.g, 5);
  expect(color.g).toBeCloseTo(color.b, 5);
  expect(color.r).toBeCloseTo(HEAT.truckEngine, 2);
});

test('열화상에서는 하늘·안개·조명도 함께 바뀐다', () => {
  const world = buildWorld();

  applyCameraMode(world, 'color');
  const dayFog = world.fog.color.getHex();
  const daySun = world.sun.intensity;

  applyCameraMode(world, 'thermal');
  // 안개색이 주간 그대로면 원경이 푸르게 남아 열화상처럼 보이지 않는다
  expect(world.fog.color.getHex()).not.toBe(dayFog);
  expect(world.sun.intensity).toBeLessThan(daySun);
  // 열화상 태양은 무채색이어야 한다
  expect(world.sun.color.r).toBeCloseTo(world.sun.color.g, 5);
});

test('모드 순환 순서 — 흑백 → 컬러 → 열화상', () => {
  expect(CAM_MODE_ORDER).toEqual(['bw', 'color', 'thermal']);
  let mode: CamMode = 'bw';
  const seen: CamMode[] = [mode];
  for (let i = 0; i < 3; i++) {
    mode = nextCamMode(mode);
    seen.push(mode);
  }
  expect(seen).toEqual(['bw', 'color', 'thermal', 'bw']); // 한 바퀴 돌아온다
});

test('셰이더 분기 값이 모드마다 다르다', () => {
  const values = CAM_MODE_ORDER.map((m) => THERMAL_UNIFORM[m]);
  expect(new Set(values).size).toBe(3);
  // 셰이더는 uThermal>1.5 를 열화상, >0.5 를 컬러로 가른다
  expect(THERMAL_UNIFORM.thermal).toBeGreaterThan(1.5);
  expect(THERMAL_UNIFORM.color).toBeGreaterThan(0.5);
  expect(THERMAL_UNIFORM.color).toBeLessThan(1.5);
  expect(THERMAL_UNIFORM.bw).toBeLessThan(0.5);
});
