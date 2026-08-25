// 진단용. 순수 ESM JavaScript, 의존성 0, TypeScript 미개입.
// 이게 살고 .ts 함수가 죽으면 원인은 TS 컴파일 쪽이다.
export function GET() {
  return new Response(JSON.stringify({ pong: true, node: process.version }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
