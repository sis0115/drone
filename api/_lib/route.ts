import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ApiResult } from './http';
import { migrate } from './db';

/**
 * 라우트 공통 껍데기. POST 만 받고, 본문을 파싱해 핸들러에 넘기고,
 * 서비스가 돌려준 {status, body} 를 그대로 내보낸다.
 * 로직은 전부 service.ts 에 있고 여기는 배선만 한다 — 그래야 테스트가 서비스를 직접 부른다.
 */
export function postRoute<T>(
  handler: (body: Record<string, unknown>, req: VercelRequest) => Promise<ApiResult<T>>,
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'method_not_allowed', message: 'POST 만 허용합니다' });
      return;
    }

    // 세이브는 캐시되면 안 된다.
    res.setHeader('Cache-Control', 'no-store');

    try {
      await migrate();
      const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
      const result = await handler(body as Record<string, unknown>, req);
      res.status(result.status).json(result.body);
    } catch (err) {
      // 내부 오류 내용은 클라이언트에 흘리지 않는다.
      console.error('[api]', err);
      res.status(500).json({ error: 'internal', message: '서버 오류' });
    }
  };
}
