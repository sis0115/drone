import { Vector3 } from 'three';
import { ShotgunInfantry } from './threats/ShotgunInfantry';
import { JammerDome } from './threats/JammerDome';
import type { Threat } from './threats/Threat';
import type { ThreatSpec } from '@/data/missions';

/**
 * 위협 스펙 → 인스턴스. 배치 좌표는 `data/missions.ts` 의 미션 정의가 갖는다 —
 * T7 시연용 하드코딩이 T8c 에서 데이터로 옮겨 간 자리다.
 */
export function buildThreats(
  specs: readonly ThreatSpec[],
  heightAt: (x: number, z: number) => number,
): Threat[] {
  return specs.map((spec) => {
    const at = new Vector3(spec.x, heightAt(spec.x, spec.z) + 1.6, spec.z);
    switch (spec.type) {
      case 'A1':
        return new ShotgunInfantry(at);
      case 'B1':
        return new JammerDome(at);
    }
  });
}
