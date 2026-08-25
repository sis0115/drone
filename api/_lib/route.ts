import type { ApiResult } from './http';
import { migrate } from './db';

/**
 * 라우트 공통 껍데기.
 *
 * Vercel 함수는 **Web Handler** 다 — `export function POST(request: Request): Response`.
 * 레거시 `(req, res)` 기본 export 형태는 이 런타임에서 부팅 단계에 실패한다 (실제로 밟음).
 * 로직은 전부 service.ts 에 있고 여기는 배선만 한다.
 */
export async function handlePost<T>(
  request: Request,
  handler: (body: Record<string, unknown>, request: Request) => Promise<ApiResult<T>>,
): Promise<Response> {
  // 세이브는 캐시되면 안 된다.
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed', message: 'POST 만 허용합니다' }), {
      status: 405,
      headers: { ...headers, allow: 'POST' },
    });
  }

  try {
    await migrate();
    const raw = await request.text();
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const result = await handler(body, request);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: 'bad_json', message: '본문이 JSON 이 아닙니다' }), {
        status: 400,
        headers,
      });
    }
    // 내부 오류 내용은 클라이언트에 흘리지 않는다.
    console.error('[api]', err);
    return new Response(JSON.stringify({ error: 'internal', message: '서버 오류' }), {
      status: 500,
      headers,
    });
  }
}
