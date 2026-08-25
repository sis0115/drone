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
- **T1 완료** — Vite + TypeScript 스캐폴딩, 480×270 3버퍼 렌더 파이프 골격, `window.__debug` 훅
- **배포 연결 완료** — https://drone-azure-rho.vercel.app (`main` = 프로덕션, `develop` = 프리뷰) + CI
- **클라우드 세이브 구현** — 계정 없는 기기 간 이어하기 (6-1장). 05 문서가 v1.0 이후로 잡았던 항목을 앞당김
- Playwright 20종 통과 (실제 Postgres 대상 15종 포함)
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
| `npm test` | Playwright (빌드 → preview → 검증 → 스크린샷). `DATABASE_URL` 있으면 클라우드 세이브 포함 |
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

### 6.2 배포 (연결 완료)

| | |
|---|---|
| 프로덕션 | https://drone-azure-rho.vercel.app (`main`) |
| 프리뷰 | `develop` push마다 URL 자동 생성 |
| 기본 브랜치 | `main` |

설정은 전부 `vercel.json` 에 있다 (Framework `vite` / Build `npm run build` / Output `dist`,
Node 22는 `package.json` 의 `engines`). **환경변수는 하나도 쓰지 않는다.**

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

## 6-1. 클라우드 세이브 / 데이터베이스

**기기 간 이어하기가 구현되어 있다.** 05 문서가 원래 v1.0 이후로 잡았던 항목을 앞당긴 것이다
(2026-08-25 결정, DEVLOG 참조). 프로토콜·보안 설계는 `docs/02_DEV_SPEC_web.md` 7-1장.

### 6-1-1. 설계 요약

- **계정 없음.** 신원 = 서버가 발급한 기기별 시크릿. 로그인 화면이 없다
- 다른 기기는 **이어하기 코드**(`7K2M-9QX4` 꼴, 10분, 1회용)로 붙는다.
  붙어도 원래 기기는 계속 동작한다 (시크릿 회전이 아니라 기기 행 추가)
- **로컬 저장이 여전히 원본이다.** 서버가 죽어도 게임은 그대로 간다
- 충돌은 `rev` 낙관적 잠금으로 잡고, 밀려난 쪽은 로컬 백업 키에 남긴다

### 6-1-2. Vercel Storage 연결 (최초 1회, 계정 로그인 필요)

> 이걸 하기 전까지 `/api/*` 는 503 을 낸다. 게임 자체는 로컬 저장으로 정상 동작한다.

1. Vercel → `drone` 프로젝트 → **Storage** 탭 → **Neon**(Postgres) 선택해 생성
   - Vercel Postgres/KV 는 이제 1st-party 가 아니라 Marketplace 통합이다
   - **새 Vercel 프로젝트를 만들 필요 없다.** 기존 프로젝트에 붙인다
2. 연결하면 `DATABASE_URL` 이 자동 주입된다 — 리포에서 설정할 게 없다
3. ⚠️ Neon 은 **pooled 연결 문자열**(호스트에 `-pooler`)을 써야 한다.
   서버리스 함수는 인스턴스마다 커넥션을 잡아서 직결로는 금방 고갈된다
4. 스키마는 첫 API 호출 때 자동 적용된다 (`db/001_init.sql`, 전부 `if not exists`)

### 6-1-3. 로컬 개발

```bash
cp .env.example .env      # DATABASE_URL 채우기
npm run dev               # /api/* 가 dev 서버에 함께 마운트된다
```

`api/` 함수는 로컬 dev/preview 서버에 Vite 플러그인으로 마운트된다
(`api/_lib/devServer.ts`). Vercel 에서는 플랫폼이 같은 역할을 한다.

`DATABASE_URL` 이 없으면 `/api/*` 가 503 을 내고 클라우드 세이브 테스트는 건너뛴다.
**단 CI 에서는 DB 가 없으면 테스트가 실패한다** — 조용히 건너뛰면 통과처럼 보이기 때문.

### 6-1-4. 확인된 것 / 안 된 것

`npm run verify` 가 실제 Postgres 를 상대로 20종을 돌린다 — 서비스 단위 11종
(낙관적 잠금, 1회용 코드, 만료, 시도 제한, 크기 상한) + 브라우저 E2E 4종
(두 기기 이어받기 포함) + 기존 5종.

**아직 실제 Neon 에 붙여 돌려보지는 않았다.** 로컬 Postgres 16 으로만 검증했다.
연결 후 첫 이어하기를 한 번 해 보는 것이 남은 확인이다.

## 7. 우선 확인이 필요한 것

- **Vercel Storage(Neon) 연결** — 붙이기 전까지 `/api/*` 는 503 이고 클라우드 세이브가 꺼져 있다. 절차는 6-1-2장
- **실제 Neon 대상 이어하기 1회** — 지금까지 로컬 Postgres 로만 검증했다
- **폰 실기 fps** (프로토타입을 폰에서 열어 HUD 우상단 확인). 45 미만이면 풀 인스턴스 수 → 그림자 해상도 → 덤불 수 순으로 조정
- **화면 감성 파라미터 확정** — 프로토타입 튜닝 패널에서 프리셋 A/B/C 중 선택 후 미세조정 → JSON 복사 → `src/data/postfx.ts`에 고정
