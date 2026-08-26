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
---

## 2026-08-26 — T2 프로토타입 모듈 분해 이식

**결과**: 드로우콜 **116 → 62**, 삼각형 262k → 259k, 인스턴스 43.3k(동일), 장애물 29개(동일).

**모듈 분해**
`world/`: noise / textures / Terrain / Instancing / Vegetation / Props / Ao / SceneBuilder
`render/`: SkyDome / ThermalRegistry / FpvPostFX / Renderer
`core/`: SignalModel
`SceneBuilder.buildWorld()` 는 **렌더러에 의존하지 않는 순수 함수**다 — 브라우저 없이 씬을 지어
드로우콜을 잴 수 있다(`tools/scene-check.mjs`).

**프로토타입에서 발견해 고친 것**
- **통나무를 두 번 만들고 있었다.** 개별 Mesh 45개 루프 + 인스턴스 50개.
  시각적으로 중복이고 앞쪽 45콜은 순수 낭비. 인스턴스만 남겼다 → 드로우콜 -54 의 주원인
- **수목선 미반영**(06 문서 E6) → `band()` 로 띠 배치 이식 완료
- **`signalQuality` 인터페이스 부재** → `SignalModel` 로 분리. 계산식은 그대로 두고
  입력(거리·LOS·재밍)과 출력을 갈랐다. v0.5 EW 시스템이 붙을 자리가 생겼다

**T1 에서 잘못 넣었던 값들 — 비교 도구가 잡았다**
T1 스캐폴딩 때 프로토타입을 읽지 않고 **추정해서 넣은 값이 전부 틀려 있었다.**
| 항목 | T1(추정) | 실제 |
|---|---|---|
| HemisphereLight | 0xbcd0d8 / 0x6b6a4e / 0.85 | 0xbcd4e6 / 0x4a5236 / **1.05** |
| DirectionalLight | 1.15 @ (-160,190,120) | **1.25 @ (-70,100,50)** |
| 안개 | 0xb9c6c2, 260, 1150 | **0xa8b5ac, 60, 540** |
| 카메라 near/far | 0.1 / 1200 | **0.3 / 1600** |
| 그림자 맵 | 2048 | **1024** |
| 그림자 far | 620 | **340** |
→ **교훈**: "검증된 상수"는 문서에 적힌 것만이 아니다. 프로토타입 코드 자체가 기준선이다.
추정으로 채우지 말 것.

**three r128 → r180 보정 (02 문서 7-2장)**
1. `ColorManagement.enabled = false` + `outputColorSpace = LinearSRGB` —
   원시 ShaderMaterial 합성에는 three 가 출력 변환을 주입하지 않아 화면이 통째로 어두워진다
2. 조명 강도 **× π** — r155 에서 조명이 물리 단위로 바뀌어 같은 intensity 가 π배 어둡다
→ 둘 다 프로토타입 룩을 기준으로 되돌린 것. 정식 선형 워크플로로 가려면 후처리 파라미터를 다시 잡아야 한다.

**부팅 게이트 버그 (T1 에서 들어온 것)**
부팅 연출이 **클램프된 dt**(`elapsed`)를 써서, 느린 기기에서 0.6초 연출이 **14초**가 됐다.
UI 연출은 물리가 아니므로 벽시계(`Time.wall`)를 쓴다. `Renderer.info` 도 합성 패스(1콜)가 아니라
**씬 패스**를 재도록 고쳤다 — 그 전에는 예산 판정이 무의미했다.

**새 도구**
- `tools/scene-check.mjs` (`npm run scene`) — esbuild 로 번들해 Node 에서 씬을 짓고 드로우콜 측정
- `tools/compare-demo.mjs` (`npm run compare`) — three r128 을 캐시해 프로토타입을 오프라인으로 띄우고,
  코드베이스와 **같은 조건(가로, 고도 18m)** 으로 렌더해 스크린샷 2장. 위 표의 값들을 전부 이 도구가 잡았다

**성능 — 이 컨테이너 수치는 실기와 무관하다**
> ⚠️ **아래 비교는 무효다.** 프로토타입의 fps 표시가 틀린 것이었고, 실제로는 두 쪽이 동등하다.
> 같은 날짜의 "정정: 성능 회귀는 없었다" 항목을 볼 것.

같은 컨테이너에서 프로토타입 **20~22fps**, 코드베이스 **0.7fps**. 캔버스 크기(863×360)·인스턴스 수·
셰이더 모두 동일한데도 벌어진다. 이분해 본 결과:
- 그림자 끄기 → 0.8fps (영향 없음)
- 풀 끄기 → 3.0fps (풀이 지배적)
- 풀 머티리얼 Lambert→Basic → 0.6fps (셰이더 복잡도 아님)
→ 알파테스트 빌보드 36k 의 **오버드로**가 SwiftShader(소프트웨어 래스터라이저)에서 폭발하는 것이고,
r128↔r180 의 내부 차이가 겹친 것으로 보인다. **GPU 가 있는 실기에서는 비용 구조가 완전히 다르다.**
- 확인 방법: 배포본에서 `/`(프로토타입)와 `/app.html`(코드베이스)을 **폰에서 나란히 열어 fps 비교**.
  30초면 된다. 이게 프로젝트 최우선 미해결 항목(실기 fps)과 같은 작업이다.
- Playwright 타임아웃을 30초 → 120초로 올렸다. 실기 성능과 무관한 환경 제약이다.

**검증**: `npm run verify` — typecheck / build / harness / perf(116) / scene(62) / Playwright **8/8**.

**다음**: T3 — 비행 2종(Arcade/Pro) + 물리 유닛테스트. 아케이드 바람 여부 결정 필요(07 문서 4장).
---

## 2026-08-26 — T3 비행 2종 + 물리 테스트

**결정: 아케이드에도 바람을 넣는다 (사용자 위임)**
프로토타입은 프로 모드에만 바람이 있었다. 그런데 아케이드가 **기본 모드**이고
GDD 6.1 은 캠페인 2차수를 "바람 추가"로 난이도를 올린다 — 기본 모드에 바람이 없으면 그 설계가 성립하지 않는다.

→ **바람은 월드의 힘이고, 어시스트 단계가 상쇄율을 정한다** (GDD 7장 어시스트 3단계에 맞물린다).
풀어시스트(아케이드)는 비행 컨트롤러가 대부분 잡아 주고 **30% 만 남긴다**
(`ARCADE_WIND_COMPENSATION = 0.3`). 흐름은 느껴지되 조작이 무너지지 않는 선.
세미/ACRO 단계 분화는 T4 입력 작업에서.
**이 값은 프로토타입에서 검증된 상수가 아니라 새로 도입한 튜닝 값이다.**

**구현**
- `drone/`: FlightModel(인터페이스) / ArcadeFlight / ProFlight / Wind / Battery
- `core/LineOfSight` — 조종소↔기체 AABB 교차. 신호 품질의 3대 입력 중 하나가 붙었다
  (거리·LOS·재밍 중 재밍만 T7 대기)
- 물리 테스트는 **바람을 끄고** 잰다 — 재현성 + 문서 수치가 무풍 조건이라서
- 모드 전환 시 위치·속도·yaw 를 넘겨 기체가 순간이동하지 않는다 (테스트로 고정)

**문서 수치 정정 — "최고속도 73.8km/h" 는 최고속도가 아니었다**
포팅 후 재면 **78.5~78.8km/h** 가 나왔다. 손계산과도 일치한다:
`v = sin(32°)·(MASS·G/cos(32°))/MASS/DRAG_H = 78.8km/h`.
속도 곡선을 뽑아 보니 **73.8 은 약 10초 시점의 값**이었다 (9초에 72.2km/h).
→ 상수는 정확했고 **문서 표현이 부정확했다.** 02 문서 4.1 에 정정을 달고,
`VERIFIED.pro` 를 `sprint10s_kmh: 73.8` / `topSpeed_kmh: 78.8` 로 나눠 **둘 다 테스트로 고정**했다.
수렴값은 해석해와도 대조한다 — 상수를 건드리면 두 테스트가 동시에 깨진다.

**아케이드 지형 추종 — 지연은 버그가 아니라 게인의 성질**
경사 0.3 에서 목표 고도보다 2.64m 낮게 따라간다. 처음엔 버그로 의심했으나
비례 제어의 정상상태 오차다: `지연 = 경사 × 수평속도 / aglGain`.
경사 3종(0.06/0.12/0.3)에서 이 관계가 성립하는지 검증하도록 테스트를 다시 썼다 —
임의 임계값(1.5m)보다 훨씬 강한 테스트다. 게인이 바뀌면 배수로 어긋나 반드시 걸린다.

**검증**: `npm run verify` — Playwright **24/24** (물리 14 + 브라우저 10).
실측 재현: 프로 호버 드리프트 0.0000m / 10초 스프린트 73.8km/h / 수렴 78.8km/h,
아케이드 전진 3초 79.2km/h / 선회 1초 115° / 평지 고도 오차 ≤0.08m / 정지 3초 이내.
브라우저: 고도 18.3m 자동 상승, 47km/h, 배터리 소모, 드로우콜 39.

**다음**: T4 — 입력(고정 패드/키보드/스크립트) + InputSource. 완료 조건은 스크립트 입력으로 8자 비행.
어시스트 3단계(풀/세미/ACRO) 분화도 여기서.
---

## 2026-08-26 — ⚠️ 정정: 성능 회귀는 없었다. 프로토타입의 fps 표시가 틀린 것이었다

**앞선 T2 기록에서 "프로토타입 20~22fps vs 코드베이스 0.7fps" 라고 적었다. 그 비교는 무효다.**

프로토타입의 `loop()` 는 fps 를 **클램프된 dt** 로 계산한다:
```js
const dt = Math.min(.05, (now-last)/1000);   // 상한 0.05s
fpsN++; fpsT += dt;
if (fpsT > 0.5) { fps = fpsN/fpsT; }         // → 프레임이 50ms 보다 느리면 항상 ~20
```
프레임이 아무리 느려도 `fpsT` 는 프레임당 최대 0.05 만 오르므로 **fps 가 20 아래로 내려가지 않는다.**

**rAF 콜백을 직접 세어 실측한 결과**
| | 실제 프레임레이트 | 화면 표시 |
|---|---|---|
| 프로토타입 | **1.12 fps** | 20~22 fps ❌ |
| 코드베이스 | **0.82 fps** | 1 fps ✅ |

→ **두 쪽 성능은 사실상 동등하다. T2 이식에 성능 회귀는 없다.**
컨테이너가 SwiftShader 소프트 렌더라 양쪽 다 1fps 대인 것뿐이다.

**이게 왜 중요한가 — 프로젝트 최우선 항목의 측정 계획이 깨져 있었다**
README·07 문서가 "폰에서 프로토타입을 열어 HUD 우상단 fps 확인, 45 미만이면 조정"이라고 적어 두었다.
그런데 그 카운터는 **20 아래를 표시할 수 없다.** 폰이 12fps 로 기어도 "20fps" 로 보이고,
문서가 정한 조정 트리거(45 미만)는 영원히 발동하지 않는다.
→ 실기 측정은 **`/app.html`** 에서 할 것. 코드베이스 카운터는 raw dt 기반이고 정직함을 실측 확인했다.

**함께 고친 것**
- `Time.fps` 가 10 미만에서 소수점 한 자리까지 보고한다 — 0.8fps 를 "1" 로 뭉개면 진단이 안 된다
- HUD 표시도 동일
- 프로토타입은 수정 금지(07 문서)이므로 **고치지 않고 문서에 함정으로 기록**했다
  (README 7장 / 07 문서 4장 / CLAUDE.md)

**교훈**: 측정 도구를 먼저 의심할 것. 30배 격차가 나오면 대상보다 자(尺)가 틀렸을 가능성이 크다.
---

## 2026-08-26 — 구조화: app/ · platform/ 분리, 계층 규칙을 테스트로 강제

**배경**: "HTML 로 계속하지 말고 제대로 프로그램 구조를 잡자"는 요청.
확인해 보니 코드베이스는 이미 TS 모듈 38개 / 3,099줄이고 `app.html` 은 22줄짜리 Vite 엔트리였다.
**그렇게 보인 진짜 이유는 배포 루트 `/` 가 프로토타입 HTML 을 서빙하고 있었기 때문이다.**
다만 구조에 실제 약점이 있었고 그건 사실이었다.

**1. 배포 경로 교체 (README 가 "T2 이식이 끝나면 바꾼다"고 예고한 시점)**
- `/` = **코드베이스** / `/prototype.html` = 기준선(비교용)
- Vite 엔트리 `app.html` → `index.html`, `tools/sync-demo.js` 출력도 이동

**2. `src/app/` — 수명주기와 화면 전환**
`main.ts` 가 렌더러·월드·비행·신호·배터리·HUD 를 전부 배선하고 루프까지 들고 있었다.
- `App` 이 루프를 소유하는 **유일한 곳**. 하는 일은 부트스트랩 / 화면 전환 / 프레임 루프 셋뿐
- `Screen` 인터페이스 + `LinkScreen`(접속 연출) / `FlightScreen`(인게임)
- 화면 흐름이 GDD 2장과 1:1 로 대응한다. 나머지 화면은 T8~T9 에서 같은 인터페이스로 들어온다
- **`main.ts` 199줄 → 19줄**

**3. `src/platform/` — 웹↔모바일 분기점**
"웹 먼저, 나중에 모바일" 의 구조적 답. storage / vibrate / lockLandscape / keepAwake /
safeAreaInsets / `usesFleetStock`(GDD 6.6.3 의 모바일·Steam 분기).
이식은 `CapacitorPlatform` 을 하나 더 만들고 `setPlatform()` 으로 갈아 끼우는 것이고
**호출부는 한 줄도 바뀌지 않는다.**
미리 만든 이유: 나중에 붙이려면 햅틱·저장 호출이 전역에 흩어진 뒤라 전부 찾아 고쳐야 한다.

**4. 계층 의존 방향 — 문서가 아니라 테스트로 강제**
```
main → app → {ui, render, world, drone, input, mission, economy} → core → platform → {data, i18n}
```
`tests/architecture.spec.ts` 4종이 검사한다: 방향 위반 / 같은 층 금지 조합 /
data·i18n 순수성 / `main.ts` 길이 / `world/` 렌더러 비의존.

**처음 돌리자마자 이미 새어 있던 위반 2건을 잡았다:**
- `core/LineOfSight` → `world/Props`(Obstacle 타입) — core 가 world 를 알고 있었다.
  → `Occluder` 최소 인터페이스를 core 에 두어 끊었다 (Obstacle 이 구조적으로 만족)
- `world/SceneBuilder` → `render/SkyDome` — 하늘돔은 렌더러가 아니라 **씬 오브젝트**다.
  → `world/SkyDome.ts` 로 이동. `ThermalRegistry` 도 같은 이유로 `world/` 로 옮겼다
  (world → render 의존이 남으면 `npm run scene` 이 브라우저 없이 못 돈다)

→ **구조는 적어 두면 무너진다.** 급할 때 지름길이 하나씩 생기고 결국 만능 파일로 돌아간다.
테스트가 유일하게 실효성 있는 방어선이다.

**5. EventBus 실사용**
절대 규칙 7 이 "시스템 간 직접 참조 금지"인데 `main.ts` 가 전부 직접 배선하고 있었다.
`screen:changed` / `flight:crashed` / `flight:spawned` / `flight:mode-changed` / `wind:gust` 추가.
화면은 UI 를 직접 부르지 않고 이벤트만 낸다.

**검증**: `npm run verify` — Playwright **28/28** (구조 4 + 물리 14 + 브라우저 10).
드로우콜·물리 실측값 변동 없음.

**다음**: T4 — 입력(가상 패드/키보드/스크립트) + 어시스트 3단계 분화.
