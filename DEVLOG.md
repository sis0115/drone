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
