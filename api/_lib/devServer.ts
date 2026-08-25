import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * 개발/프리뷰 서버에서 `api/` 함수를 그대로 마운트한다.
 *
 * 함수는 Vercel 과 동일한 **Web Handler** 규약이다 (`export function POST(request: Request)`),
 * 그래서 여기서는 node 요청을 Request 로 바꾸고 돌려받은 Response 를 node 응답에 쓴다.
 * 이게 없으면 로컬에서 클라우드 세이브를 브라우저로 검증할 방법이 없다 (`vercel dev` 는 로그인 필요).
 * 프로덕션 번들에는 들어가지 않는다 (config 전용).
 */

type Loader = (path: string) => Promise<Record<string, unknown>>;
type WebHandler = (request: Request) => Promise<Response> | Response;

const MAX_BODY = 512 * 1024; // 세이브 상한(256KB)의 두 배

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('본문이 너무 큽니다'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function toRequest(req: IncomingMessage, body: Buffer): Request {
  const host = req.headers.host ?? 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD' && body.length > 0;
  return new Request(`http://${host}${req.url}`, {
    method,
    headers,
    // Buffer 를 그대로 넘기면 타입이 맞지 않는다 — 뷰로 감싼다.
    body: hasBody ? new Uint8Array(body) : undefined,
  });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function middleware(load: Loader): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();

    const nodeRes = res as ServerResponse;

    if (!process.env.DATABASE_URL) {
      json(nodeRes, 503, {
        error: 'no_database',
        message: 'DATABASE_URL 미설정 — 로컬 Postgres 를 띄우거나 .env 를 채우세요',
      });
      return;
    }

    // `/api/profile/pull?x=1` → `/api/profile/pull.ts`
    const route = url.split('?')[0].replace(/\/+$/, '');
    if (!/^\/api\/[a-z0-9/_-]+$/i.test(route) || route.includes('..')) {
      json(nodeRes, 404, { error: 'not_found', message: '없는 경로입니다' });
      return;
    }

    try {
      const mod = await load(`${route}.ts`);
      // Vercel 과 같은 규칙: 메서드 이름의 named export 를 찾는다.
      const handler = mod[(req.method ?? 'GET').toUpperCase()] as WebHandler | undefined;
      if (typeof handler !== 'function') {
        json(nodeRes, 405, { error: 'method_not_allowed', message: '해당 메서드 핸들러가 없습니다' });
        return;
      }
      const body = await readBody(req as IncomingMessage);
      await send(nodeRes, await handler(toRequest(req as IncomingMessage, body)));
    } catch (err) {
      console.error('[dev-api]', err);
      json(nodeRes, 500, { error: 'internal', message: String(err) });
    }
  };
}

export function devApiPlugin(): Plugin {
  return {
    name: 'slfpv-dev-api',
    configureServer(server: ViteDevServer) {
      // ssrLoadModule 이 TS 를 그때그때 변환해 준다 — 별도 빌드 단계가 필요 없다.
      server.middlewares.use(middleware((p) => server.ssrLoadModule(p)));
    },
    configurePreviewServer(server: PreviewServer) {
      // 프리뷰는 정적 산출물만 서빙하므로 TS 런타임이 없다.
      // Playwright 가 프리뷰를 쓰므로, 변환용 vite 인스턴스를 하나만 띄워 재사용한다.
      let loader: Promise<ViteDevServer> | null = null;
      const load = async (path: string) => {
        loader ??= import('vite').then((v) =>
          v.createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' }),
        );
        return (await loader).ssrLoadModule(path);
      };
      server.middlewares.use(middleware(load));
    },
  };
}
