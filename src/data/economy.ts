/**
 * SP 경제 — 05 문서 4장.
 *
 * ⚠️ 원칙(CLAUDE.md 규칙 5): **유료는 시간만 판다.** 성능 P2W·확률형 상자·FOMO 타이머 금지.
 * 여기 있는 것은 전부 플레이로 버는 값이다.
 */

/** 표적 가치표 (05 문서 4.1). 확인(BDA) 시 2배는 확인 시스템(v0.3)에서 붙는다. */
export const SP_VALUE = {
  truck: 40,
} as const;

/**
 * 차수 배율 (05 문서 4.3.2). 도전 보너스는 출격 전 옵션(v0.3)에서 붙는다.
 * 배율 상한 2.5 는 그때 함께 온다 — 지금은 차수 배율만.
 */
export const TIER_MULTIPLIER = [1.0, 1.4, 1.8] as const;

/**
 * 기체 손실 페널티: 기체 가격의 5% (05 문서 4.3). 회수 귀환 시 0.
 * T1 스패로우-7 은 기본 지급(가격 0)이라 현 콘텐츠에서 페널티도 0 —
 * 수식은 지금 세워 두고 값은 T2+ 기체와 함께 온다.
 */
export const LOSS_PENALTY_RATE = 0.05;

/** 기체 가격표 (05 문서 4.3 초안). 상점(v0.3)이 읽는다. */
export const FRAME_PRICE: Record<string, number> = {
  'frame.sparrow7': 0, // 기본 지급
};
