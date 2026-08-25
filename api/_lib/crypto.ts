import { createHash, randomBytes } from 'node:crypto';

/** 혼동되는 글자(0/O, 1/I)를 뺀 32자 — 사람이 폰에서 받아 적는 코드용. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 8;

/** 프로필 소유를 증명하는 베어러 토큰. 고엔트로피라 sha256 보관으로 충분하다. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** `7K2M-9QX4` 형태. 32^8 ≈ 2^40 — 10분 TTL + 시도 제한과 함께 써야 안전하다. */
export function newLinkCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

/** 입력 코드를 정규화한다 — 소문자·공백·하이픈 차이를 흡수. */
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}
