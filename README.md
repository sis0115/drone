# SIGNAL LOST : FPV — 프로젝트 핸드오프

> **이 파일을 가장 먼저 읽을 것.** 이후 작업은 `docs/` 기준.
> 핸드오프 대상: Claude Code (개발 착수) / 작성일 2026-08-25

---

## 1. 무슨 프로젝트인가

**저화질 FPV 드론 전쟁 시뮬레이터.** 모바일 웹 우선, 이후 Steam 확장.

- **핵심 감성**: 480p 흑백/열화상 아날로그 화면 너머의 전쟁. 조종사는 참호가 아니라 벙커 모니터 앞에 있다.
- **죽으면 게임이 죽는 3가지**:
  1. 저화질 카메라 연출 (성능 절약 + 독보적 감성 + 에셋 경쟁 회피)
  2. "실적 → 보급" 진행 시스템 (실제 킬 포인트 제도의 게임화)
  3. 실전 기반 미션 설계 (9종 시나리오 + 위협 카탈로그 16종)
- **세계관**: 실제 전쟁 모티프 + 국가명 추상화(베리스카 공화국 / 연방) — 스토어 심사 리스크 회피

## 2. 현재 상태

- 기획 문서 7종 완성 (`docs/`)
- **동작하는 프로토타입 v0.7 존재** (`prototype/signal_lost_fpv.html`) — 단일 HTML, 외부 에셋 0
- **헤드리스 검증 도구 동작** (`tools/`) — 브라우저 없이 Three.js 씬 검증
- **T1 완료** — Vite + TypeScript 스캐폴딩, 480×270 3버퍼 렌더 파이프 골격, `window.__debug` 훅, Playwright 4종 통과
- 다음: **T2 (프로토타입 모듈 분해 이식)**

### 검증 완료된 수치
| 항목 | 실측 |
|---|---|
| 드로우콜 / 삼각형 | **116 / 262k** (예산 <120 통과) |
| 프로 모드 호버 드리프트 | **0.0000m** (10초) |
| 프로 모드 최고속도 | **73.8km/h** |
| 아케이드 전진 속도 | **79.2km/h** (3초) |
| 아케이드 고도 유지 오차 | **0.08m** |
| 인스턴스 총량 | 43,344 |

## 3. 문서 지도

| 파일 | 내용 | 언제 |
|---|---|---|
| `docs/02_DEV_SPEC_web.md` | **개발 기준서** — 스택, 구조, 검증된 상수, 성능 예산, T1~T9 | 항상 (최우선) |
| `docs/07_PROTOTYPE_NOTES.md` | 프로토타입에 뭐가 있고 뭘 그대로 옮겨야 하는지 | 이식 작업 시 (T2~T6) |
| `docs/01_GDD.md` | 게임 전체 설계 — 미션 9종, 위협 16종, 편대 시스템, 경제/보상 | 시스템 구현 시 |
| `docs/04_STYLE_UIUX.md` | 화면 규격, 컬러 토큰 8색, 금지 목록, 와이어프레임 11종 | UI 작업 시 |
| `docs/05_DATA_BALANCE.md` | 데이터 스키마, 저장 JSON, SP 수치, 재고제 | 데이터·경제 작업 시 |
| `docs/06_ART_REFERENCE.md` | 실제 드론 영상 분석 → 셰이더/HUD 실측 규격 | 렌더·HUD 작업 시 |
| `docs/03_NARRATIVE.md` | 3막 9챕터, 캐릭터, 브리핑 규격 | 텍스트·연출 작업 시 |
| `docs/strings_master.csv` | 로컬라이즈 원본 (KO/EN) | i18n 작업 시 |

⚠️ Unity 기반 개발 설계서 v0.1은 폐기됨. 스택은 **Three.js 확정**.

## 4. 절대 규칙

1. **검증된 물리·렌더 상수를 임의로 바꾸지 말 것** (02 문서 4장). 바꿔야 하면 근거 수치와 함께 `DEVLOG.md`에 기록.
2. **인스턴싱 필수** — 반복 오브젝트를 개별 Mesh로 만들면 드로우콜이 1,940까지 폭증(실측). 02 문서 5장.
3. **에셋(3D 모델·텍스처 파일) 도입 금지** — 재미 검증 전까지 프로시저럴 유지.
4. **UI 금지 목록 준수** (04 문서 6장): 라운드 버튼, 그라데이션, 그림자, 코인 아이콘, "축하합니다!" 류. 판정 기준 — *"이게 야전 단말기 화면에 있을 법한가?"*
5. **수익화 원칙**: 유료는 시간만 판다. 성능 P2W·확률형 상자·FOMO 타이머 금지.
6. **하드코딩 금지**: 문자열은 i18n, 튜닝 값은 `src/data/`.
7. **매 태스크 종료 시**: `npm run verify` → 스크린샷 확인 → 커밋 → `DEVLOG.md` 갱신.

## 5. 개발 시작

```bash
npm install
npm run dev        # http://localhost:5173 (host 노출 — 폰에서 같은 망으로 접속 가능)
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입 체크 + 프로덕션 빌드 (`dist/`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run harness` | 헤드리스 씬 생성 검증 (`tools/harness.js`) |
| `npm run perf` | 드로우콜/삼각형 실측 — 예산(<120) 초과 시 종료 코드 1 |
| `npm test` | Playwright (빌드 → preview → 검증 → 스크린샷) |
| `npm run verify` | 위 4종 일괄 — **커밋 전 필수** |

스크린샷은 `tests/__screenshots__/` 에 남는다.

## 5-1. 지금 할 일

```
T2: 프로토타입 모듈 분해 이식 (Renderer / PostFX / Terrain / Instancing)
  - prototype/signal_lost_fpv.html 의 씬 생성부를 src/world/, src/render/ 로 분해
  - 합성 셰이더(현재 패스스루)에 후처리 전 효과 이식 — 3버퍼 구조 유지
  - P 객체 하드코딩 → src/data/postfx.ts
  완료 조건: 프로토타입과 동일 화면, 드로우콜 <120 유지
```

이후 T3(비행 2종 + 물리 테스트) → T4(입력) 순. 상세는 `docs/02_DEV_SPEC_web.md` 6장.

## 6. 워크플로우

### 6.1 브랜치

| 브랜치 | 역할 | Vercel |
|---|---|---|
| `main` | 안정판. 재미 검증·실기 확인이 끝난 것만 올린다 | **프로덕션** 배포 |
| `develop` | **평소 개발은 여기서 한다.** T2, T3… 태스크 커밋이 쌓인다 | **프리뷰** 배포 (커밋마다 URL) |
| `claude/*` | 에이전트 세션 작업 브랜치 | 배포 안 함 (`vercel.json` 에서 차단) |

마일스톤(v0.1 = T1~T6 등)이 끝나면 `develop` → `main` 병합.

```bash
git checkout develop
# ... 작업 ...
npm run verify          # 커밋 전 필수
git commit -m "T2: prototype module port"
git push origin develop # → Vercel 프리뷰 URL 자동 생성 → 폰에서 확인
```

### 6.2 Vercel 연결 (최초 1회, 계정 로그인 필요)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `sis0115/drone` 선택
2. 설정은 **건드리지 않는다.** `vercel.json` 이 이미 다 지정한다
   (Framework `vite` / Build `npm run build` / Output `dist` / Node 22는 `engines` 로 결정)
3. **Deploy** → 프로덕션 URL 발급
4. Settings → Git → Production Branch 가 `main` 인지 확인

연결 후에는 `develop` 에 push할 때마다 프리뷰 URL이 자동 생성된다. 환경변수는 현재 **하나도 필요 없다**.

### 6.3 배포 확인

HUD 우하단에 `브랜치 커밋해시` 가 찍힌다 (예: `develop a1b2c3d`).
폰에서 열었을 때 이 값이 방금 push한 커밋과 같아야 반영된 화면이다.
콘솔에서는 `__debug.build` 로도 확인할 수 있다.

### 6.4 CI

`.github/workflows/ci.yml` 이 `main`/`develop` push와 PR에서 `typecheck → build → harness → perf → playwright` 를 돌린다.
**드로우콜 예산(<120) 초과와 Playwright 실패가 여기서 막힌다** — Vercel은 빌드만 보기 때문에 이 게이트가 없으면 깨진 화면이 그대로 배포된다.
스크린샷은 Actions 아티팩트로 올라온다.

### 6.5 기타

- 모바일 Claude Code ↔ 맥북(tmux + Tailscale) 원격
- 커밋 규칙: `T3: flight models`
- 세션 간 컨텍스트 유실 방지: `DEVLOG.md` 누적

## 6-1. 데이터베이스 — 현재 불필요

**지금 붙이지 않는다.** 05 문서 1장이 저장 계층을 이렇게 못 박고 있다:
동적 데이터는 `PlayerProfile` 하나뿐이고, **v1.0까지 로컬 JSON**, 클라우드 백업은 그 이후다.

- 서버가 없다. 계정·랭킹·매치메이킹·소셜 기능이 설계에 없다
- 전부 싱글플레이라 조작 방지를 위한 서버 권위가 필요 없다
- 저장은 `src/core/Save.ts` 한 파일에 격리돼 있고 `schemaVersion` 이 이미 붙어 있다

**붙여야 할 시점** — 아래 중 하나라도 들어올 때:
1. 클라우드 세이브(기기 간 이어하기) — 05 문서가 v1.0 이후로 잡은 항목
2. 랭킹·주간 쿼터 서버 검증 (현재 `fleetStock.restockQueue` 재보급 타이머는 기기 시계를 믿는다. 싱글플레이라 지금은 무해)
3. 계정 시스템 / 결제 영수증 검증

그때 붙인다면 Vercel과 붙는 조합이 자연스럽다 (Vercel Postgres 또는 Supabase). `Save.ts` 의 `load`/`save` 뒤에 백엔드를 갈아끼우는 형태가 되므로, **지금 구조를 바꿀 필요는 없다.**

## 7. 우선 확인이 필요한 것

- **Vercel 프로젝트 연결** — 리포지토리를 Vercel에 붙이면 `vercel.json` 그대로 자동 배포된다 (framework: vite / build: `npm run build` / output: `dist`). 현재 상태에서 배포하면 검은 화면 + HUD 코너 텍스트가 뜨는 것이 정상.
- **폰 실기 fps** (프로토타입을 폰에서 열어 HUD 우상단 확인). 45 미만이면 풀 인스턴스 수 → 그림자 해상도 → 덤불 수 순으로 조정
- **화면 감성 파라미터 확정** — 프로토타입 튜닝 패널에서 프리셋 A/B/C 중 선택 후 미세조정 → JSON 복사 → `src/data/postfx.ts`에 고정
