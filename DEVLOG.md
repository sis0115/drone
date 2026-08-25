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
