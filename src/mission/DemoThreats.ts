import { Vector3 } from 'three';
import { ShotgunInfantry } from './threats/ShotgunInfantry';
import { JammerDome } from './threats/JammerDome';
import type { Threat } from './threats/Threat';

/**
 * T7 시연용 배치. **T8 미션 러너가 들어오면 `MissionDef` 가 이 자리를 가져간다** —
 * 위협 좌표는 미션 데이터지 코드가 아니다. 지금은 프레임워크를 화면에서 확인할
 * 대상이 필요해서 여기에 둔다.
 *
 * 배치 근거: 표적 트럭이 도로(x=120)를 따라 -z 로 달린다(`world/Targets`).
 * 그 진입로에 A1 을 앉히고 접근 축선에 B1 을 얹어야 둘 다 실제로 마주친다.
 * GDD 4.5 규칙 3(미션당 2~3개 상한)에 맞춰 **2개까지만** 둔다.
 */
export function buildDemoThreats(heightAt: (x: number, z: number) => number): Threat[] {
  const ground = (x: number, z: number): Vector3 => new Vector3(x, heightAt(x, z) + 1.6, z);
  return [
    // 도로 옆 참호 — 트럭에 붙으려면 이 앞을 지난다
    new ShotgunInfantry(ground(104, -150)),
    // 조종소와 도로 사이 — 진입 자체에 신호 대가를 매긴다
    new JammerDome(ground(60, -80)),
  ];
}
