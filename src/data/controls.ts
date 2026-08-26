/**
 * 조작 설정 — GDD 7장.
 * 스틱 배치와 어시스트 단계는 리뷰 불만 1순위 항목이라 **반드시 옵션으로 둔다.**
 */

/**
 * 스틱 배치.
 * - **Mode 2** (기본): 좌 = 스로틀/요, 우 = 피치/롤. 입문자·모바일 표준
 * - Mode 1: 좌 = 피치/요, 우 = 스로틀/롤. RC 경력자용
 */
export type StickMode = 1 | 2;

/**
 * 어시스트 3단계 — GDD 7장.
 * 비행 모델 선택과 1:1로 대응한다:
 *   full → ArcadeFlight (고도 유지 + 수평 자동)
 *   semi → ProFlight 각도 모드 (스틱을 놓으면 수평으로 돌아온다)
 *   acro → ProFlight 레이트 모드 (놓아도 기울기가 유지된다 — 고수용)
 */
export type Assist = 'full' | 'semi' | 'acro';

/** ACRO 로 클리어하면 보상이 붙는다 (GDD 7장 +20%, 6.7.1 배율 +0.2). */
export const ASSIST_REWARD_BONUS: Record<Assist, number> = {
  full: 0,
  semi: 0,
  acro: 0.2,
};

/** 가상 패드 기하 — 프로토타입 실측값(px). */
export const PAD = {
  /** 스틱 원 지름 */
  size: 132,
  /** 노브 지름 */
  knob: 48,
  /** 화면 가장자리 여백 */
  margin: 26,
  /** 이 반경 안을 누르면 "패드 위"로 보고 중심 기준으로 잡는다 */
  grabRadius: 86,
  /** 이 픽셀만큼 끌면 축이 1.0 */
  travel: 54,
  /** 노브가 시각적으로 움직이는 최대 거리 */
  knobTravel: 40,
} as const;

/** 스틱 입력이 이 값보다 작으면 0 으로 본다 — 손가락 미세 떨림 제거. */
export const STICK_DEADZONE = 0.06;
