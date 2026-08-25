# 개발 설계서 v0.3 (웹 스택) — 「SIGNAL LOST: FPV」

> ⚠️ Unity 기반 v0.1은 폐기. **본 문서가 유일한 개발 기준.**
> v0.3 갱신: 프로토타입 v0.7에서 검증된 수치·구조를 반영하고, 성능 예산을 실측 기반으로 재설정.

---

## 1. 기술 스택

| 항목 | 결정 |
|---|---|
| 렌더링 | **Three.js** (npm 최신 안정판. 프로토타입은 r128 CDN) |
| 물리 | **자체 물리** (검증 완료). Rapier.js는 v0.5 이후 재검토 |
| 빌드 | **Vite** |
| 언어 | **TypeScript** |
| UI/HUD | DOM + SVG 오버레이 (캔버스 밖 = 선명) |
| 저장 | localStorage (JSON, `schemaVersion` 필수) — **게임플레이의 원본** |
| 클라우드 세이브 | Vercel Functions (`api/`) + Postgres. 로컬 저장 위에 얹은 동기화 계층 |
| 배포 | Vercel 자동 배포 |
| 테스트 | Playwright(브라우저) + **헤드리스 하네스**(`tools/`, 브라우저 없이 검증) |
| 네이티브 | Capacitor (v1.0 시점, 필요 시) |

**금지**: React/Vue 등 프레임워크, 물리 엔진 조기 도입, 3D 모델·텍스처 파일 조기 도입.

**서버에 대한 원칙**: `api/` 는 세이브 동기화 전용이다. 게임 로직·물리·판정을 서버로 옮기지 않는다.
서버가 죽어도 게임은 로컬 저장만으로 완주할 수 있어야 한다.

## 2. 프로젝트 구조

```
signal-lost-fpv/
├── docs/                    # 기획 문서 (코드보다 우선)
├── prototype/               # v0.7 단일 파일 (참조용, 수정 금지)
├── tools/                   # 헤드리스 검증 하네스
├── api/                     # Vercel 서버리스 함수 (클라우드 세이브)
│   ├── _lib/        db / crypto / http / service / devServer  ← `_` 시작은 라우트가 아님
│   ├── profile/     create / pull / push
│   └── link/        create / claim
├── db/                      # SQL 마이그레이션
├── src/
│   ├── main.ts
│   ├── core/        GameState / EventBus / Save / Time
│   ├── drone/       ArcadeFlight / ProFlight / DroneSpec / Battery
│   ├── input/       VirtualPad / KeyboardInput / InputSource
│   ├── render/      Renderer(480p RT) / FpvPostFX / ThermalMode / SkyDome
│   ├── world/       Terrain / SceneBuilder / Instancing / Obstacles / Targets
│   ├── mission/     MissionDef / MissionRunner / Threats / StrikePackage
│   ├── ui/          Hud / TargetOverlay / Screens / Radio / TuningPanel
│   ├── economy/     Sp / FleetStock / Quota
│   ├── i18n/        strings / locale
│   └── data/        정적 데이터 정의
├── tests/           physics.spec.ts / visual.spec.ts
└── index.html / vite.config.ts / package.json / README.md / DEVLOG.md
```

**원칙**: 문자열 하드코딩 금지(i18n), 튜닝 값 하드코딩 금지(`src/data/`), 시스템 간 직접 참조 금지(EventBus).

## 3. 검증 루프 (이 스택을 택한 핵심 이유)

### 3.1 헤드리스 하네스 (`tools/` — 이미 동작함)

브라우저 없이 Three.js 씬 생성 코드를 Node에서 실행해 API 에러·성능을 잡는다.
```bash
npm i three
node tools/harness.js   # 씬 생성 에러 검출, 오브젝트/인스턴스 수 리포트
node tools/perf.js      # 씬 그래프 순회 → 드로우콜/삼각형 실측
```
**이 하네스로 실제 잡은 버그**: `flatShading` 미지원 머티리얼(경고 수백 회), 누락된 `skyMat`/`obstacles` 정의, 좌표 변환 부호 오류, 드로우콜 1,940 → 116 최적화.

### 3.2 Playwright (T1에서 구축)

1. 헤드리스 크롬으로 dev 서버 로드
2. `InputSource` 스크립트 구현체로 정해진 시나리오 비행
3. **스크린샷 저장 → Claude가 직접 확인**
4. `window.__debug`로 좌표·속도·fps 노출 → 수치 검증
5. 콘솔 에러 0 확인

```ts
window.__debug = { state, drone:{pos,vel,agl,spd}, fps, mission, setInput(fn) };
```

## 4. 검증된 상수 (임의 변경 금지)

### 4.1 프로 모드 (실물리, 기울기 기반)
```
MASS 1.2kg / G 9.81 / MAX_THRUST 35N
MAX_TILT 32° / TILT_RESP 6.0
MAX_VS 4.0 m/s / VS_KP 3.2 / YAW_RATE 2.1 rad/s
DRAG_H 0.28 / DRAG_V 0.25
```
실측: 호버 10초 드리프트 **0.0000m**, 최고속도 **73.8km/h**, 관성 잔존 확인.

### 4.2 아케이드 모드 (기본값, 속도 기반 + 지형 자동 추종)
```
spd 22 m/s / acc 3.2 / turn 2.0 rad/s / strafe 11 / climb 14
aglMin 4m / aglMax 140m / 고도 추종 게인 2.4, 응답 5.0
충돌: 지면=소프트 정지, 장애물=16m/s 미만이면 밀려남
표적 판정 반경: 아케이드 7.0m / 프로 4.2m
```
실측: 전진 3초 **79.2km/h**, 고도 유지 오차 **0.08m**, 선회 1초 **115°**, 정지까지 3초.

### 4.3 카메라/렌더
```
렌더 해상도 480×270 (고정) → 화면 업스케일
FOV 118° / 배럴 왜곡 0.26 (오버레이 좌표에 역변환 동일 적용 필수)
신호 감쇠: 160m부터 시작, LOS 차폐 -0.55, 재밍 -0.45
```

### 4.4 열화상 열값 테이블 (물체별 — 셰이더 리맵 아님)
```
하늘 0.03 / 물 0.11 / 풀 0.40 / 덤불 0.30 / 수관 0.34 / 줄기 0.42
바위 0.52 / 도로 0.50 / 지면 0.62 / 송전탑 0.62 / 건물벽 0.74 / 지붕 0.68~0.70
건초 0.80 / 트럭 엔진부 0.98 / 트럭 적재함 0.60 / 트럭 바퀴 0.45
```
→ 06 문서 1.1 실측표 기반. **모드 전환 시 머티리얼 스왑 방식**을 유지할 것.

## 5. 성능 예산 (실측 기반 재설정)

| 항목 | 예산 | 프로토타입 v0.7 실측 |
|---|---|---|
| 드로우콜 | **< 120** | 116 ✅ |
| 삼각형 | < 300k | 262k ✅ |
| 인스턴스 총량 | — | 43,344 |
| 렌더 해상도 | 480×270 고정 | ✅ |
| 폰 브라우저 fps | 60 (최소 45) | 실기 측정 필요 |

**필수 규칙 — 인스턴싱**: 반복 오브젝트(수목·바위·풀·가드레일·전신주·건초·굴뚝·잔해·연료탱크·송전탑)는 **반드시 InstancedMesh**로. 개별 Mesh로 만들면 드로우콜이 즉시 1,900대로 폭증한다(실측). 트럭처럼 파트가 다른 오브젝트는 **지오메트리 병합 + 정점 컬러**로 파트당 1콜.

## 6. 태스크 분할

| # | 태스크 | 완료 조건 |
|---|---|---|
| **T1** | Vite+TS 스캐폴딩, 폴더 구조, Playwright + 헤드리스 하네스 이식, `__debug` 훅, Vercel 연결 | 빈 화면 배포 + 스크린샷 1장 저장 + `node tools/perf.js` 동작 |
| **T2** | 프로토타입 모듈 분해 이식 (Renderer/PostFX/Terrain/Instancing) | 프로토타입과 동일 화면, 드로우콜 <120 유지 |
| **T3** | 비행 2종(Arcade/Pro) + 물리 유닛테스트 | 4.1/4.2 실측값 재현 |
| **T4** | 입력(고정 패드/키보드/스크립트) + InputSource | Playwright 스크립트 입력으로 8자 비행 |
| **T5** | HUD + 표적 오버레이 (배럴 왜곡 역변환 포함) | 스크린샷에서 점선 십자·락온 박스 정렬 확인 |
| **T6** | 열화상 모드 (열값 테이블 데이터화) | 하늘/물 어둡고 엔진부 백열 |
| **T7** | 미션 러너 + 목표/실패 판정 + 디브리핑 + 실패 원인 분석 | M2 1차수 클리어 가능 |
| **T8** | SP 경제 + 재고제 + 저장 + 로드아웃 화면 | 재접속 시 SP·재고 유지 |
| **T9** | i18n(CSV 로드) + 성능 패스 | 언어 전환 동작, 중급 폰 60fps |

각 태스크: 구현 → 빌드 → 하네스 + Playwright 검증 → 스크린샷 확인 → 커밋(`T3: flight models`) → `DEVLOG.md` 갱신.

## 7. 마일스톤

- **v0.1** (T1~T6): 조작 가능한 저화질 FPV 비행 + 열화상 — *재미 검증 지점*
- **v0.2** (T7~T9): M2 미션 완주 + 경제 루프
- **v0.3**: 작전 요청(일일 랜덤), 위협 3종
- **v0.5**: 타격 편대(StrikePackage), 미션 5종
- **v1.0**: 9미션 3차수, 4개국어, Capacitor 검토

## 7-1. 클라우드 세이브 (v0.2에서 선반영)

05 문서는 원래 v1.0까지 로컬 JSON만 쓰기로 했으나, **기기 간 이어하기를 먼저 붙이기로 결정**했다
(2026-08-25, 사용자 결정. DEVLOG 참조).

- **계정 없음.** 신원은 서버가 발급한 **기기별 시크릿** 하나뿐이다. 로그인 화면이 없다
  (04 문서 금지 목록상 OAuth 버튼은 톤에 맞지 않는다)
- 다른 기기는 **이어하기 코드**(8자, 10분, 1회용)로 같은 프로필에 붙는다.
  붙을 때 시크릿을 회전시키지 않고 **기기 행을 추가**하므로 원래 기기가 튕기지 않는다
- 시크릿·코드는 **sha256 으로만 저장**한다. 조회가 해시 기본키라 평문 비교가 없다
- 동시 수정은 `rev` **낙관적 잠금**으로 잡는다. 충돌 시 진행도가 큰 쪽을 남기고
  밀려난 쪽은 로컬 백업 키에 보관한다 (조용히 버리지 않는다)
### 배포 함정 — 전부 실제로 밟은 것들

`api/` 함수가 배포에서만 `FUNCTION_INVOCATION_FAILED` 로 죽는 조합이 세 가지 있었다.
**로컬에서는 전부 정상이었다.** 셋 다 부팅 단계 실패라 로그에 스택도 남지 않는다.

1. **`package.json` 에 `"type": "module"` 필수.** tsconfig 가 `module: ESNext` 로 ESM 을 뱉는데
   이게 없으면 Node 가 출력된 `.js` 를 CommonJS 로 읽고 문법 오류를 낸다.
   → `tools/*.js` 는 CJS 라서 `tools/package.json` 에 `"type": "commonjs"` 를 두어 그 디렉터리만 되돌린다
2. **`api/` 안의 상대 import 에 `.js` 확장자 필수.** `moduleResolution: bundler` 는 확장자 없는
   import 를 그대로 두는데 Node ESM 은 해석하지 못한다. TS 가 `./db.js` → `db.ts` 를 매핑하므로
   소스 파일명은 그대로 두면 된다
3. **루트 `tsconfig.json` 에 `"noEmit": true` 를 두지 말 것.** Vercel 이 이 설정으로 `api/*.ts` 를
   컴파일하는데 출력이 생성되지 않는다. 타입 체크는 CLI 플래그(`tsc --noEmit`)로 한다.
   `api/tsconfig.json` 을 따로 두는 방법은 **통하지 않는다** — Vercel 은 루트 설정을 읽는다

또한 함수 시그니처는 **Web Handler** 다 (`export function POST(request: Request): Response`).
레거시 `(req, res)` 기본 export 는 부팅 단계에서 실패한다.

진단 순서: `api/health.ts`(무의존)가 살아 있는지 먼저 본다. 그것도 죽으면 위 1·3번,
health 는 살고 라우트만 죽으면 2번이다.

- 서버리스 풀은 `max: 1` 이다. **트랜잭션 콜백 안에서 `db().query()` 를 부르면 자기 자신을 기다리며 멈춘다** —
  반드시 넘겨받은 client 로만 질의할 것 (실제로 이 버그를 밟았다)

## 8. 열려 있는 결정

- 화면 감성 파라미터 최종값 (프로토타입 튜닝 패널에서 확정 후 `src/data/`에 고정)
- 실사 텍스처(CC0) 도입 시점 — 재미 검증 이후
- 사운드 3종(확인킬음/SP틱/유폭) 구현 시점
- Rapier.js / Capacitor 도입 여부
