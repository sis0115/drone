/**
 * 컬러 토큰 8색 — 04 문서 1.2. **이 8색 밖으로 나가지 않는다.**
 * 금지: 라운드 모서리, 그림자, 그라데이션 (04 문서 6장).
 */
export const COLOR = {
  bgBase: '#0A0F0B',
  bgPanel: '#111A13',
  line: '#2E4A34',
  textPrimary: '#8FFFAB',
  textDim: '#4E7A5C',
  accentAmber: '#FFB347',
  accentRed: '#FF4D4D',
  textWhite: '#D8E4DA',
} as const;

export type ColorToken = keyof typeof COLOR;

/** CSS 변수(`--c-bg-base` 등)로 노출해 스타일시트와 단일 출처를 공유한다. */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [token, hex] of Object.entries(COLOR)) {
    root.style.setProperty(`--c-${token.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, hex);
  }
}
