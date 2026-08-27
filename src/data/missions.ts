import { WORLD_SEED } from './world';

/**
 * 미션 정의 — T8c. **위협 좌표는 미션 데이터지 코드가 아니다.**
 * T7 의 `mission/DemoThreats.ts` 가 이 자리로 옮겨 왔다.
 *
 * GDD 6.1: 차수가 오를수록 적이 세지는 게 아니라 4대 제약이 하나씩 추가된다 —
 * 그래서 미션 정의는 위협 배치와 시드만 다르고 코드는 같다. 맵 재활용이 설계다.
 */

export interface ThreatSpec {
  type: 'A1' | 'B1';
  x: number;
  z: number;
}

export interface MissionDef {
  id: string;
  /** `src/i18n` 키 */
  titleKey: string;
  /** 브리핑 규격 (03 문서 4장): 상황 2줄 · 임무 · 조언(전술 힌트) · 캐릭터 한 줄 */
  brief: { situationKey: string; objectiveKey: string; tipKey: string; flavorKey: string };
  /** 월드 시드 — 같은 미션은 언제나 같은 맵이다 (재현성 = 공략 가능성) */
  seed: number;
  /** 격파 목표 수. 자폭 드론이라 1소티 = 최대 1격파 — 목표 1이 기본이다(4.7) */
  destroyGoal: number;
  /** GDD 4.5 규칙 3: 미션당 위협 2~3개 상한 */
  threats: readonly ThreatSpec[];
}

/** M2 「강철 사냥」 1차수 — 트럭 종대 추격 타격. 신규 제약 없음(기본). */
export const M2_1: MissionDef = {
  id: 'm2-1',
  titleKey: 'mission.m2.title',
  brief: {
    situationKey: 'brief.m2.situation',
    objectiveKey: 'brief.m2.objective',
    tipKey: 'brief.m2.tip',
    flavorKey: 'brief.m2.flavor',
  },
  seed: WORLD_SEED,
  destroyGoal: 1,
  threats: [
    /**
     * 참호 — 도로에서 ~45m (플레이스루 실측, DEVLOG 2026-08-27).
     * 16m(원 배치)로 두면 위험 반경 50m 가 도로를 완전히 덮어, 브리핑 조언대로
     * 상승-강하를 해도 강하 순간 사선에 든다 — "조언대로 해도 죽는" 첫 미션이 된다.
     * 45m 면 도로 위 접근은 반경 끄트머리만 스치고, 서쪽 들판 지름길은 위험하다 —
     * 그게 이 위협이 가르치려는 것이다.
     */
    { type: 'A1', x: 76, z: -132 },
    // 표적 구역 위 — 진입 자체에 신호 대가를 매긴다
    { type: 'B1', x: 100, z: -195 },
  ],
};
