/** 서비스 계층이 돌려주는 결과. 라우트는 이걸 그대로 응답으로 옮기기만 한다. */
export interface Result<T = unknown> {
  status: number;
  body: T;
}

export interface ApiError {
  error: string;
  message: string;
}

/** 성공 본문이거나 오류 본문이거나 — 라우트는 둘을 구분하지 않고 그대로 내보낸다. */
export type ApiResult<T> = Result<T | ApiError>;

export function ok<T>(body: T): Result<T> {
  return { status: 200, body };
}

export function fail(status: number, code: string, message: string): Result<ApiError> {
  return { status, body: { error: code, message } };
}

/** 프록시 뒤에서 클라이언트 IP 를 뽑는다. 시도 제한 키로만 쓴다. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw?.split(',')[0] ?? 'unknown').trim() || 'unknown';
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
