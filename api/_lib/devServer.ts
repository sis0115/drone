import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * 개발/프리뷰 서버에서 `api/` 함수를 그대로 마운트한다.
 *
 * Vercel 배포에서는 플랫폼이 `api/*.ts` 를 서버리스 함수로 잡아 준다.
 * 로컬에는 그런 게 없어서, 이게 없으면 클라우드 세이브를 브라우저로 검증할 방법이 없다.
 * 프로덕션 번들에는 들어가지 않는다 (config 전용).
 */

type Loader = (path: string) => Promise<Record<string, unknown>>;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // 세이브 본문 상한(256KB)의 넉넉한 두 배에서 끊는다.
      if (raw.length > 512 * 1024) reject(new Error('본문이 너무 큽니다'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

/** Vercel 함수가 기대하는 res 모양(status().json())을 node 응답 위에 씌운다. */
function shimResponse(res: ServerResponse) {
  return {
    setHeader: (k: string, v: string) => res.setHeader(k, v),
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    },
  };
}

function middleware(load: Loader): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();

    const shim = shimResponse(res as ServerResponse);

    if (!process.env.DATABASE_URL) {
      shim.status(503).json({
        error: 'no_database',
        message: 'DATABASE_URL 미설정 — 로컬 Postgres 를 띄우거나 .env 를 채우세요',
      });
      return;
    }

    // `/api/profile/pull?x=1` → `/api/profile/pull.ts`
    const route = url.split('?')[0].replace(/\/+$/, '');
    if (!/^\/api\/[a-z0-9/_-]+$/i.test(route) || route.includes('..')) {
      shim.status(404).json({ error: 'not_found', message: '없는 경로입니다' });
      return;
    }

    try {
      const mod = await load(`${route}.ts`);
      const handler = mod.default as
        | ((r: unknown, s: unknown) => Promise<void>)
        | undefined;
      if (typeof handler !== 'function') {
        shim.status(404).json({ error: 'not_found', message: '핸들러가 없습니다' });
        return;
      }
      const body = await readBody(req as IncomingMessage);
      await handler({ method: req.method, headers: req.headers, body, url }, shim);
    } catch (err) {
      console.error('[dev-api]', err);
      shim.status(500).json({ error: 'internal', message: String(err) });
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
