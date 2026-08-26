# DEVLOG

세션별 작업과 주요 결정을 누적 기록한다. 매 태스크 종료 시 갱신 필수.

---

## 2026-08-25 — 핸드오프 (개발 착수 전)

**결정**
- 스택: Unity → **Three.js + Vite + TypeScript**
  (사유: 기존 모바일→Vercel 워크플로우 유지, Claude가 헤드리스로 자율 검증 가능, 480p 컨셉이라 WebGL 성능 한계 회피)
- 비행 모델 2종 채택: 아케이드(기본) / 프로(실물리)
- 열화상은 셰이더 리맵이 아니라 **머티리얼 스왑** 방식으로 확정
- 반복 오브젝트는 **InstancedMesh 필수** (개별 Mesh 시 드로우콜 1,940 실측)

**검증 완료 수치**
- 드로우콜 116 / 삼각형 262k / 인스턴스 43,344
- 프로: 호버 10초 드리프트 0.0000m, 최고속도 73.8km/h
- 아케이드: 전진 79.2km/h, 고도 유지 오차 0.08m, 선회 115°/s

**헤드리스 하네스로 잡은 버그**
- MeshLambertMaterial의 flatShading 미지원 (경고 수백 회)
- 누락된 skyMat / obstacles 정의
- 흙길 회전 좌표 변환 부호 오류
- 드로우콜 1,940 → 116 최적화

**다음**: T1 스캐폴딩

---

## 2026-08-25 — T1 스캐폴딩 완료

**한 일**
- Vite 6 + TypeScript 5 + three r180 스캐폴딩, 02 문서 2장 폴더 구조 생성
- `src/data/` 에 검증된 상수 고정: `flight.ts`(4.1/4.2), `render.ts`(4.3 + 성능 예산),
  `thermal.ts`(4.4 열값 16종), `theme.ts`(컬러 토큰 8색), `postfx.ts`(프로토타입 P 객체 + 프리셋)
- `FpvRenderer` — 480×270 RT → 풀스크린 쿼드 합성. **3버퍼 구조(rtA/rtPrev/합성)를 T1부터 세움**
  (07 문서 2.1: 프리즈·코덱 잔상·모션블러가 전부 이 구조에 의존). 합성 셰이더는 아직 패스스루
- `EventBus`(타입 지정 이벤트) / `GameState`(`signalQuality` 단일 변수 포함) / `Time`(dt 상한 1/20s) / `Save`(schemaVersion + 백업 1세대)
- `InputSource` 인터페이스 + `KeyboardInput` + `ScriptedInputSource` — Playwright가 사람과 같은 자리에 입력을 꽂는다
- `window.__debug` 훅 (`state/drone/fps/frame/mission/render/errors/ready/setInput`)
- i18n: `docs/strings_master.csv` 를 `?raw` 로 직접 읽는다 — **복사본 없음, 문서가 단일 출처**
- `tools/` 이식: 하드코딩된 `/mnt/user-data/outputs/...` 경로를 리포 기준 상대경로로 교체
  (`SLFPV_PROTOTYPE` 환경변수로 덮어쓰기 가능). `perf.js` 는 드로우콜 예산 초과 시 종료 코드 1
- Playwright: 모바일(Pixel 7) 프로젝트 1종. 컨테이너에 미리 깔린 크로미움을 자동 감지해 쓴다
- `vercel.json` (framework vite / build `npm run build` / output `dist`)

**검증**
- `npm run typecheck` / `npm run build` 통과 (번들 481kB, gzip 124kB — 대부분 three)
- `node tools/perf.js` → 드로우콜 **116** / 삼각형 **262k** (예산 <120 통과) — r128 CDN 기준 수치를 r180 npm에서 재현
- `node tools/harness.js` → 씬 생성 정상, 풀 35,272 / 덤불 5,063 / obstacles 29 / trucks 3
- `npx playwright test` → **4/4 통과**, 콘솔 에러 0, 스크린샷 `tests/__screenshots__/t1-boot.png`

**결정 / 발견**
- `package.json` 에 `"type": "module"` 을 넣지 않았다 — `tools/*.js` 가 CJS라 문서의 `node tools/perf.js` 명령이 그대로 동작해야 하기 때문
- three r180에서 프로토타입(r128 작성)의 THREE API가 전부 유효함을 확인. 별도 호환 레이어 불필요
- **인스턴스 총량은 실행마다 43,3xx 로 흔들린다** (씬 생성이 `Math.random()` 기반). 문서의 43,344는 한 표본이며 회귀 판정 기준으로 쓰면 안 된다. 판정은 드로우콜/삼각형으로 한다
- 헤드리스 컨테이너는 SwiftShader 소프트 렌더라 fps 41이 찍힌다 — 실기 fps와 무관. **폰 실측은 여전히 미해결**

**다음**: T2 — 프로토타입 씬 생성부를 `src/world/` · `src/render/` 로 분해 이식. 드로우콜 <120 유지가 완료 조건.
---

## 2026-08-25 — 배포 파이프라인 + 브랜치 전략

**결정: 브랜치**
- `main`(프로덕션) / `develop`(개발·프리뷰) / `claude/*`(에이전트 작업, 배포 제외)
- 빈 리포였으므로 T1 커밋에서 `main`·`develop` 을 함께 끊었다. 이후 개발은 `develop` 에서 한다
- 마일스톤 단위로 `develop` → `main` 병합 (v0.1 = T1~T6)

**결정: DB 미도입**
05 문서 1장이 동적 데이터를 `PlayerProfile` 하나 / v1.0까지 로컬 JSON으로 못 박고 있다.
서버·계정·랭킹이 설계에 없고 전량 싱글플레이라 서버 권위가 필요 없다. **지금은 붙이지 않는다.**
도입 트리거는 (1) 클라우드 세이브 (2) 랭킹·쿼터 서버 검증 (3) 계정/결제 영수증.
저장이 `Save.ts` 한 파일에 격리돼 있어 그때 백엔드만 갈아끼우면 되므로 선제 구조 변경도 하지 않는다.
- 알려진 한계: `fleetStock.restockQueue` 재보급 타이머가 기기 시계를 믿는다. 싱글플레이라 현재는 무해하지만, 랭킹이 붙는 순간 서버 시간이 필요해진다

**한 일**
- `vercel.json`: `git.deploymentEnabled` 로 `claude/*` 프리뷰 차단(배포 한도 절약), `/assets/*` 는 immutable 캐시(해시 파일명), `index.html` 은 캐시 안 함
- `package.json` 에 `engines.node >=22` — Vercel 이 이걸로 런타임을 고른다
- **빌드 스탬프 주입**: `vite.config.ts` 의 `define` 으로 `__BUILD_ID__`/`__BUILD_BRANCH__` 를 박아 HUD 우하단에 `develop a1b2c3d` 형태로 표시.
  Vercel 은 `VERCEL_GIT_COMMIT_SHA`/`_REF`, 로컬은 `git rev-parse`. `__debug.build` 로도 노출.
  폰에서 프리뷰를 열었을 때 "이게 방금 push한 커밋인가"를 확인할 방법이 없으면 배포하며 개발하는 루프가 성립하지 않는다
- `.github/workflows/ci.yml`: `typecheck → build → harness → perf → playwright`.
  **Vercel 은 빌드만 보므로 드로우콜 예산 초과와 Playwright 실패는 여기서만 막힌다.** 스크린샷은 아티팩트로 업로드

**검증**
- `npm run verify` 통과. Playwright **5/5** (빌드 스탬프 테스트 1건 추가), 드로우콜 116

**남은 수동 작업 (계정 로그인 필요 — 에이전트가 대신 못 함)**
- vercel.com/new 에서 `sis0115/drone` import → Deploy. 설정 변경 불필요, 환경변수 0개
- GitHub 리포 Settings → 기본 브랜치가 `main` 인지 확인

**다음**: T2 — 프로토타입 씬 생성부를 `src/world/` · `src/render/` 로 분해 이식.
---

## 2026-08-25 — 배포 연결 완료 · 파이프라인 전 구간 검증

**연결됨**
- 프로덕션: https://drone-azure-rho.vercel.app
- GitHub 기본 브랜치를 `main` 으로 변경 (import 시점에는 `claude/*` 로 잡혀 있었다)

**실제 배포본으로 확인한 것**
- `GET /` → HTTP 200, 빌드된 `index.html` 정상 서빙
- 번들에 빌드 스탬프가 박혀 있음 (`claude/project-setup-jpz9ue` / `6f31feb`)
  → **Vercel 이 `VERCEL_GIT_COMMIT_SHA`/`_REF` 를 제대로 주고 `define` 주입이 프로덕션 빌드에서 동작한다**
- `/assets/*` 응답에 `cache-control: public, max-age=31536000, immutable` + `x-content-type-options: nosniff`
  → `vercel.json` 의 headers 규칙이 실제로 적용됨
- GitHub Actions CI: `main`·`develop` 양쪽 6f31feb 에서 **success** (run #3, #4).
  #1·#2 는 concurrency 그룹이 후속 push 로 취소한 것 — 정상 동작

**남은 부정합 (이 커밋으로 해소)**
- import 시점의 프로덕션 배포가 `claude/project-setup-jpz9ue` 소스로 잡혀 있었다.
  기본 브랜치가 `main` 이 된 뒤 `main` 에 push 가 없어 갱신되지 않은 상태.
  이 커밋을 `main` 에 올리면 `main` 기준 프로덕션 배포로 교체된다
- `vercel.json` 의 `claude/*` 프리뷰 차단은 import 시 생성된 배포에는 적용되지 않았다 (그 시점엔 설정 이전).
  이후 push 부터 적용

**알아 둘 것**
- 이 컨테이너에서는 헤드리스 크로미움이 에이전트 프록시를 통과하지 못해(`ERR_CONNECTION_RESET`)
  **배포된 URL 을 브라우저로 직접 열어 검증할 수 없다.** 로컬 preview 서버 대상 Playwright(5/5) +
  배포 번들 curl 검증으로 대신한다. 실기 확인은 여전히 사람이 폰으로 해야 한다
- 리포지토리가 **public** 이다. 기획 문서 전량이 공개 상태

**다음**: T2 — 프로토타입 씬 생성부를 `src/world/` · `src/render/` 로 분해 이식.
---

## 2026-08-25 — 클라우드 세이브 (기기 간 이어하기)

**결정 경위**
DB 도입에 대해 "05 문서가 v1.0까지 로컬 JSON으로 규정했고 서버·계정이 설계에 없으니 지금은 불필요"
라고 의견을 냈으나, **사용자가 클라우드 세이브로 결정**. 그대로 진행하고 05 문서를 갱신했다.

**설계 — 계정을 만들지 않는 클라우드 세이브**
- 신원 = 서버가 발급한 **기기별 시크릿** 1개. 로그인 화면 없음
  (04 문서 금지 목록상 OAuth 버튼은 톤에 맞지 않는다)
- 2번째 기기는 **이어하기 코드**(8자, 10분, 1회용)로 붙는다
- **기기별로 시크릿을 발급하는 이유**: 단일 시크릿 + 회전 방식이면 코드로 이어받는 순간
  원래 기기가 튕긴다. `profile_devices` 에 행을 추가하는 방식이라 둘 다 살아 있다.
  E2E 테스트가 이걸 직접 검증한다
- 시크릿·코드는 **sha256 으로만 저장**. 조회가 해시 기본키라 평문 비교·타이밍 공격 표면이 없다
- 코드 엔트로피 2^40 → 10분 TTL + IP당 15분 10회 시도 제한으로 방어
- 동시 수정은 `rev` **낙관적 잠금**. 409 시 서버본을 실어 보내 클라이언트가 비교한다.
  진행도(비행시간 > 킬 > SP)가 큰 쪽을 남기고 **밀려난 쪽은 로컬 백업 키에 보관** — 조용히 버리지 않는다
- **로컬 저장이 여전히 게임플레이 원본.** 오프라인/서버 장애 시 게임은 그대로 진행된다

**밟은 버그 (실제로 테스트가 잡음)**
- 서버리스용 풀이 `max: 1` 인데 `claimLink` 가 트랜잭션 커넥션을 쥔 채
  `recordFailure` 에서 두 번째 커넥션을 요구 → **자기 자신을 기다리며 교착**. 4개 테스트가 타임아웃.
  `withTransaction` 헬퍼로 정리하고 실패 기록을 트랜잭션 밖으로 뺐다.
  → 02 문서 7-1장에 규칙으로 박아 둠

**인프라**
- `api/` 서버리스 함수 5종. 로직은 `_lib/service.ts` 에 모으고 라우트는 배선만 —
  그래야 테스트가 서비스를 직접 부를 수 있다
- **`api/_lib/devServer.ts`**: Vite 플러그인으로 dev/preview 서버에 `api/` 를 마운트.
  이게 없으면 로컬에서 클라우드 세이브를 브라우저로 검증할 방법이 없다 (`vercel dev` 는 로그인 필요)
- CI 에 `postgres:16` 서비스 컨테이너 추가. **DATABASE_URL 이 없으면 CI 는 실패한다** —
  조용히 skip 하면 통과처럼 보이기 때문
- `.env.example` 추가, `.gitignore` 에 `!.env.example`

**검증**
- `npm run verify` → **Playwright 20/20**
  - 서비스 단위 11종: 낙관적 잠금, 409 서버본 반환, 1회용 코드, 만료, 코드 정규화,
    이전 코드 무효화, 시도 제한, 크기 상한(256KB), 401
  - 브라우저 E2E 4종: 켜기→동기화, **두 브라우저 컨텍스트로 실제 이어받기**, 잘못된 코드,
    패널 스타일 규칙(라운드 0·그림자 없음·버튼 채우기 없음)
  - 기존 5종 유지. 드로우콜 116 변동 없음
- 번들 크기 영향 없음 (480.8KB) — `api/` 는 클라이언트 번들에 들어가지 않는다

**남은 것 (사람이 해야 함)**
- Vercel → `drone` 프로젝트 → Storage → **Neon 연결**. 새 프로젝트 만들 필요 없음.
  붙기 전까지 `/api/*` 는 503, 게임은 로컬 저장으로 정상 동작
- Neon 은 반드시 **pooled 연결 문자열**(`-pooler`)
- **실제 Neon 대상 검증은 아직 없다.** 로컬 Postgres 16 으로만 확인했다

**다음**: T2 — 프로토타입 씬 생성부를 `src/world/` · `src/render/` 로 분해 이식.
---

## 2026-08-25 — 배포된 /api/* 가 전부 죽던 문제 해결

**증상**: 로컬은 21/21 통과인데 배포에서는 모든 `/api/*` 가 `FUNCTION_INVOCATION_FAILED`.
부팅 단계 실패라 스택이 남지 않고, Vercel 로그 접근 권한이 없어 추측이 길어졌다.

**이분으로 원인 확정**
의존성 0 / TypeScript 미개입인 `api/ping.mjs` 를 띄웠더니 **200**, 같은 내용의 `.ts` 는 **500**.
→ 내 로직이 아니라 TS 컴파일·모듈 해석 문제로 확정. 여기서부터 빨라졌다.

**실제 원인 3개 (중첩되어 있었다)**
1. **`"type": "module"` 누락** — tsconfig 가 ESM 을 뱉는데 package.json 에 선언이 없어
   Node 가 출력된 `.js` 를 CJS 로 읽고 문법 오류. `.mjs` 만 살아남은 이유가 이것
   - `tools/*.js` 는 CJS 이므로 `tools/package.json` 에 `"type": "commonjs"` 로 그 디렉터리만 예외 처리.
     문서의 `node tools/perf.js` 명령을 그대로 유지했다
2. **상대 import 에 확장자 없음** — `moduleResolution: bundler` 출력이 `from './db'` 인데
   Node ESM 은 해석 불가. `.js` 를 붙여 해결 (TS 가 `./db.js` → `db.ts` 매핑)
   - health.ts 는 상대 import 가 없어서 1번만 고쳤을 때 혼자 살아났고, 이게 2번을 가리키는 단서가 됐다
3. **루트 tsconfig 의 `"noEmit": true`** — Vercel 이 이 설정으로 api 를 컴파일하면 출력이 없다.
   CLI 플래그로 옮겼다. `api/tsconfig.json` 을 따로 두는 우회는 **통하지 않았다**(Vercel 은 루트를 읽는다)

추가로 함수 시그니처를 **Web Handler**(`export function POST(request: Request)`)로 전환했다.
레거시 `(req, res)` 기본 export 는 이 런타임에서 부팅에 실패한다. `@vercel/node` 의존성도 제거됐다.

**최종 배포 상태 (실측)**
```
GET  /api/health        200  {"ok":true,"node":"v22.23.1","pg":"ok","hasDatabaseUrl":false}
POST /api/profile/*     503  {"error":"no_database", ...}   ← Neon 미연결. 의도된 응답
POST /api/link/*        503  동일
GET  /api/profile/pull  405  메서드 가드 정상
```
`pg` 드라이버가 함수 번들에 정상 포함됨을 확인했다.

**남긴 것**
- 02 문서 7-1장에 "배포 함정" 절 추가 — 셋 다 로컬에서 재현되지 않으므로 문서가 유일한 방어선이다
- `tsconfig.json` 상단에 noEmit 재발 방지 경고 주석
- `DATABASE_URL` 미설정 시 500 이 아니라 **503 `no_database`** 를 돌려준다.
  "스토리지 미연결"과 "서버 깨짐"은 구분되어야 한다

**교훈**: 로컬 dev 미들웨어가 배포와 같은 규약(Web Handler)을 타도록 맞춰 뒀는데도,
**모듈 시스템 차이는 잡지 못했다.** vite 의 ssrLoadModule 이 확장자 없는 import 를 알아서 풀기 때문이다.
로컬 통과가 배포 동작을 보장하지 못하는 구간이 남아 있다는 뜻 — 배포 후 `/api/health` 확인이 필요하다.

**다음**: Neon 연결(사람) → 실기 이어하기 1회 → T2.
---

## 2026-08-26 — 클라우드 세이브 제거 · 데모를 사이트 루트로

**결정 (사용자)**: 저장 기능을 빼고, 지난 데모 버전으로 되돌린 뒤 기획–데모 점검부터 한다.
DB 는 필요해질 때 다시 붙인다.

**제거한 것**
- `api/` 전체(서버리스 함수 5종 + `_lib`), `db/`, `src/core/CloudSave.ts`, `src/ui/CloudPanel.ts`
- 클라우드 관련 테스트 3종, `.env.example`, HUD 진입 버튼, `pg`/`@types/pg` 의존성
- CI 의 postgres 서비스, vite 의 dev-api 플러그인, i18n `ui.cloud.*` 키
- 02·05·README 의 클라우드 세이브 서술

**복원 지점**: 커밋 **`5f253a8`**. (태그를 만들려 했으나 이 환경의 git 프록시가 태그 push 를 막는다.)
```
git checkout 5f253a8 -- api db src/core/CloudSave.ts src/ui/CloudPanel.ts \
  tests/cloudsave.spec.ts tests/cloudsave.e2e.spec.ts tests/schema-sync.spec.ts
```
되살릴 때 반드시 먼저 읽을 것 — **Vercel 배포에서만 재현되는 함정 3종**(로컬은 전부 통과했다):
1. `package.json` 에 `"type": "module"` 필수 (없으면 출력 `.js` 가 CJS 로 읽혀 문법 오류)
2. `api/` 안 상대 import 에 `.js` 확장자 필수 (Node ESM 은 확장자 없는 경로를 해석 못 함)
3. 루트 `tsconfig.json` 에 `"noEmit": true` 금지 (함수 출력이 생성되지 않음).
   `api/tsconfig.json` 우회는 통하지 않는다 — Vercel 은 루트를 읽는다
   그리고 함수 시그니처는 Web Handler (`export function POST(request: Request)`).

**남겨 둔 것과 이유**
- `"type": "module"` + `tools/package.json`(`commonjs`) — 이미 검증된 조합이고 더 올바른 설정이다.
  되돌리면 나중에 서버를 붙일 때 같은 함정을 다시 밟는다
- `tsconfig.json` 의 noEmit 경고 주석 — 같은 이유

**데모를 사이트 루트로**
- `/` = 프로토타입 v0.7 데모, `/app.html` = 코드베이스 스캐폴딩
- `tools/sync-demo.js` 가 dev/build 전에 `prototype/signal_lost_fpv.html` 을
  `public/index.html` 로 **가공 없이 복사**한다. public/ 은 Vite 가 손대지 않으므로
  단일 HTML + CDN 구조가 그대로 보존된다. 원본은 07 문서상 수정 금지라 복사만 한다
- `tests/demo.spec.ts` 가 배포본과 원본이 **바이트 단위로 같은지** 확인한다 — 사본 드리프트 방지
- Vite 엔트리를 `index.html` → `app.html` 로 옮겨 rewrite 없이 정적 파일만으로 갈랐다.
  로컬 preview 와 배포의 경로가 동일하다 (이전 배포 사고의 교훈)

**한계**: 이 컨테이너에서는 헤드리스 크로미움이 프록시를 통과하지 못해 **cdnjs 의 three r128 을 받지 못한다.**
데모 테스트는 문서 구조·진입 버튼까지만 확인하고, 실제 씬 렌더는 검증하지 못한다.
**데모 화면 확인은 사람이 폰/PC 브라우저로 해야 한다.**

**검증**: Playwright 7/7, 드로우콜 116(변동 없음), 빌드 정상.

**다음**: 기획 문서 ↔ 데모 점검.
---

## 2026-08-26 — 기획 ↔ 데모 점검 (1차)

문서 8종을 통독하고 `prototype/signal_lost_fpv.html` 실물과 대조했다.
**문서가 사실이라고 적어 둔 것 중 실물과 다른 것**을 우선 잡았다.

### 고친 것 (문서 결함)

| # | 문제 | 조치 |
|---|---|---|
| 1 | **01 GDD 전체가 아직 Unity 기준** — 헤더 "엔진: Unity 6 (URP) / 언어: C#", 9장 기술 스펙 표 전체(C#/Rigidbody/Firebase/unity-mcp/Unity IAP). 02 문서는 "Unity v0.1 폐기"라고 했지만 **01 본문은 갱신된 적이 없다.** 새 세션이 01을 먼저 읽으면 잘못된 스택을 믿는다 | 01 헤더·9장을 웹 스택으로 정정. 광고/IAP·리더보드는 **재검토 필요 항목으로 명시**(Unity 전제라 웹에서 무효) |
| 2 | **07 문서의 `signalQuality` 서술이 사실이 아님** — "단일 변수 인터페이스이므로 구조를 유지할 것"이라 했으나, 실물은 `loop()` 안에 `sig`/`sigSmooth` 지역 변수로 인라인돼 있다. 그대로 옮기면 v0.5 EW 가 조작할 지점이 없다 | 07 2.2를 실제 코드와 함께 정정하고, **T2에서 `SignalModel` 로 분리**하라고 명시 |
| 3 | 07 "프리셋 4종" → 실제 3종(A 아날로그/B 디지털/C 혼합) | 정정 |
| 4 | **수목선 미반영** — 06 문서 3장 E6가 "나무 산발 → 띠 형태 재배치"를 지시했으나 미이행. 띠형 수목선은 은폐·매복 지형이라 M2/M7 설계의 전제 | 07 4장 미해결 항목에 추가 |
| 5 | **아케이드 모드에 바람이 없다** — 프로 물리에만 `wind.x/z + gust` 가 들어간다. 그런데 아케이드가 **기본 모드**이고, GDD 6.1 캠페인 2차수는 "바람 추가"로 난이도를 올린다. 기본 모드에 바람이 없으면 그 설계가 성립하지 않는다 | 07 4장에 추가, T3 결정 사항으로 표시 |

### 대조 결과 — 문서 주장이 맞는 것

06 문서 5장 반영 우선순위 6종은 모두 실물에 존재한다(열화상 머티리얼 스왑 / 매크로블록 / 점선 HUD /
표적 오버레이 / 모션블러). 3장 "즉시 반영" 4종 중 가드레일·연료탱크·**물**(700×420 평면, line 346)은
들어갔고 수목선만 빠졌다. 배터리는 GDD대로 구현(180초 기준 + 기동 강도 계수).

### 아직 판단이 필요한 것 (사용자 결정)

- **위협 시스템 전용 태스크가 계획에 없다.** GDD 4.5는 위협 16종과 "모든 위협은 예고된다(최소 0.5초
  텔레그래프)"는 규칙을 세웠는데, 02 문서 태스크 분할 T1~T9 에는 위협 프레임워크가 없다.
  T7이 "미션 러너 + 목표/실패 판정"뿐이라 위협이 미션 코드에 흩어질 위험
- **M10 번호 공백** — GDD 는 M1~M9, 06 문서가 M11~M13 을 신규 제안. M10 이 비어 있다.
  05 문서 미션 ID 규칙(`m2.tier1`)에 영향
- **v0.1 정의 불일치** — GDD 10장 v0.1 = "물리+스틱+셰이더+테스트맵", 02 문서 7장 v0.1 = T1~T6(열화상 포함).
  큰 충돌은 아니나 GDD 의 주 단위 일정은 Unity 기준 추정치라 무의미

**다음**: 위 3건 결정 → T2 착수.
