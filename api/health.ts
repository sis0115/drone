/**
 * 무의존 진단 엔드포인트. 모듈 스코프에서 아무것도 import 하지 않는다 —
 * 다른 함수가 로드 단계에서 죽을 때, 런타임 자체는 살아 있는지 가르기 위한 것이다.
 */
export async function GET(): Promise<Response> {
  const report: Record<string, unknown> = {
    ok: true,
    node: process.version,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };

  // 의존성이 함수 번들에 실렸는지 확인한다.
  try {
    const pg = await import('pg');
    report.pg = typeof pg.default?.Pool === 'function' || typeof pg.Pool === 'function' ? 'ok' : 'odd';
  } catch (e) {
    report.pg = `실패: ${String(e)}`;
  }

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
