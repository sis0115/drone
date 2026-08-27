/**
 * 기체 정의 — 05 문서 2.1/4.3. 데모 범위: T1 스패로우-7(기본) + T2 호넷-10(구매).
 * 성능 차이는 **배터리 배율 하나**부터 시작한다 — 05 문서 4.5 "고밀도 셀 +30%".
 * 속도·바람 저항 등은 재미 검증 뒤 늘린다. P2W 아님: SP 는 플레이로만 번다.
 */
export interface FrameDef {
  id: string;
  tier: number;
  nameKey: string;
  descKey: string;
  statKey: string;
  priceSp: number;
  /** 기본 체공(180초) 대비 배율 */
  batteryMult: number;
}

export const FRAMES: readonly FrameDef[] = [
  {
    id: 'frame.sparrow7',
    tier: 1,
    nameKey: 'frame.sparrow7.name',
    descKey: 'frame.sparrow7.desc',
    statKey: 'frame.sparrow7.stat',
    priceSp: 0,
    batteryMult: 1,
  },
  {
    id: 'frame.hornet10',
    tier: 2,
    nameKey: 'frame.hornet10.name',
    descKey: 'frame.hornet10.desc',
    statKey: 'frame.hornet10.stat',
    priceSp: 800,
    batteryMult: 1.3,
  },
] as const;

export function frameById(id: string): FrameDef {
  return FRAMES.find((f) => f.id === id) ?? FRAMES[0];
}
