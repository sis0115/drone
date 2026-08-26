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
| 저장 | localStorage (JSON, `schemaVersion` 필수) |
| 배포 | Vercel 자동 배포 |
| 테스트 | Playwright(브라우저) + **헤드리스 하네스**(`tools/`, 브라우저 없이 검증) |
| 네이티브 | Capacitor (v1.0 시점, 필요 시) |

**금지**: React/Vue 등 프레임워크, 물리 엔진 조기 도입, 3D 모델·텍스처 파일 조기 도입, 서버 의존.

**서버에 대한 원칙**: 현재 서버가 없다. 게임은 로컬 저장만으로 완주할 수 있어야 한다.
나중에 세이브 동기화를 위해 서버를 붙이더라도 게임 로직·물리·판정은 클라이언트에 남긴다.

## 2. 프로젝트 구조

```
signal-lost-fpv/
├── docs/                    # 기획 문서 (코드보다 우선)
├── prototype/               # v0.7 단일 파일 (기준선, 수정 금지)
├── tools/                   # 헤드리스 검증 하네스
├── index.html               # Vite 엔트리 (캔버스 + 오버레이 컨테이너, 20줄)
└── src/
    ├── main.ts        배선만 (20줄 미만 — 테스트가 강제)
    ├── app/           **수명주기·화면 전환.** 루프를 소유하는 유일한 곳
    │     App.ts / Screen.ts / screens/{LinkScreen, FlightScreen}
    ├── platform/      **웹↔모바일 분기점.** storage / vibrate / 화면잠금 / safeArea / 재고제 플래그
    ├── ui/            DOM·SVG 위젯 (Hud, LinkGauge) — 캔버스 밖이라 선명하다
    ├── render/        Renderer(480p RT 3버퍼) / FpvPostFX
    ├── world/         SceneBuilder / Terrain / Vegetation / Props / SkyDome / ThermalRegistry
    ├── drone/         FlightModel(iface) / ArcadeFlight / ProFlight / Wind / Battery
    ├── input/         InputSource(iface) / KeyboardInput / VirtualPad(T4)
    ├── mission/       MissionDef / MissionRunner / Threats (T7~T8)
    ├── economy/       Sp / FleetStock / Quota (T9)
    ├── core/          GameState / EventBus / Save / Time / SignalModel / LineOfSight
    ├── i18n/          strings (원본 docs/strings_master.csv)
    └── data/          정적 튜닝 값 — 다른 계층을 부르지 않는 순수 데이터
```

### 2.1 의존 방향 — **테스트가 강제한다**

```
main → app → {ui, render, world, drone, input, mission, economy} → core → platform → {data, i18n}
```

- **아래가 위를 import 하지 않는다.** 예: `core/` 는 `world/` 를 모른다
  (필요하면 `LineOfSight.Occluder` 처럼 **최소 구조 인터페이스**를 core 쪽에 둔다).
- 같은 층에서도 금지 조합이 있다: `world ↛ render`, `drone ↛ ui` 등.
  특히 **`world/` 는 렌더러를 몰라야 한다** — 그래야 `npm run scene` 이 브라우저 없이 씬을 짓는다.
- `data/` `i18n/` 은 게임 코드를 부르지 않는다.
- `main.ts` 는 20줄 미만.

`tests/architecture.spec.ts` 가 위 규칙을 전부 검사한다. **문서로만 적어 두면 무너진다** —
실제로 이 테스트를 처음 돌렸을 때 `core → world`, `world → render` 두 건이 이미 새어 있었다.

### 2.2 화면 흐름

GDD 2장 / 04 문서 2장의 흐름을 `app/Screen` 구현들로 표현한다.
현재: `link`(접속 연출) → `flight`(인게임). 나머지(title/ops/briefing/loadout/debrief)는 T8~T9.
**화면끼리 서로를 직접 부르지 않는다** — 전환은 `ctx.go()`, 통지는 EventBus (절대 규칙 7).

### 2.3 웹 먼저, 모바일 나중 — 이식 경로

웹으로 만들고 **Capacitor 로 감싸 모바일로 낸다.** 게임 코드는 그대로 간다.
그러려면 기기에 닿는 부분이 한 곳에 모여 있어야 하고, 그게 `src/platform/` 이다.

| 기기 기능 | 웹 (현재) | 모바일 이식 시 |
|---|---|---|
| 저장 | localStorage | Capacitor Preferences |
| 진동 | `navigator.vibrate` | Haptics 플러그인 |
| 화면 잠금 | Screen Orientation API | 네이티브 매니페스트 |
| 화면 켜둠 | Wake Lock API | KeepAwake 플러그인 |
| 노치 여백 | CSS `env(safe-area-inset-*)` | 동일 |
| 재고제 (GDD 6.6.3) | 켬 | 모바일 켬 / **Steam 끔** |

이식 작업은 `WebPlatform` 옆에 `CapacitorPlatform` 을 하나 더 만들고 `setPlatform()` 으로 갈아 끼우는 것이다.
**호출부는 한 줄도 바뀌지 않는다.**

미리 만들어 둔 이유: 나중에 붙이려면 햅틱·저장 호출이 코드 전역에 흩어진 뒤라 전부 찾아 고쳐야 한다.

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
실측: 호버 10초 드리프트 **0.0000m**, **10초 스프린트 73.8km/h**, 관성 잔존 확인.

> 정정 (2026-08-26, T3): "최고속도 73.8" 은 **10초 시점의 값**이지 상한이 아니다.
> 같은 상수로 끝까지 가속하면 **78.8km/h** 에서 수렴한다(무풍). 해석해와도 일치한다:
> `v = sin(32°)·(MASS·G/cos(32°))/MASS/DRAG_H`. 상수는 그대로 두고 표현만 바로잡았다.
> `tests/physics.spec.ts` 가 두 수치를 모두 고정한다.

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
| **T2** ✅ | 프로토타입 모듈 분해 이식 (Renderer/PostFX/Terrain/Instancing) | 드로우콜 **62** (프로토타입 116 대비 -54), 삼각형 259k |
| **T3** ✅ | 비행 2종(Arcade/Pro) + 물리 유닛테스트 | 실측값 재현 — 물리 테스트 **14종** (`tests/physics.spec.ts`) |
| **T4** | 입력(고정 패드/키보드/스크립트) + InputSource | Playwright 스크립트 입력으로 8자 비행 |
| **T5** | HUD + 표적 오버레이 (배럴 왜곡 역변환 포함) | 스크린샷에서 점선 십자·락온 박스 정렬 확인 |
| **T6** | 열화상 모드 (열값 테이블 데이터화) | 하늘/물 어둡고 엔진부 백열 |
| **T7** | **위협 프레임워크** — `Threat` 인터페이스 + 텔레그래프 규약 + 대표 2종(A1 산탄총 / B1 재밍 돔) | 위협이 미션 코드가 아니라 `mission/Threats` 에만 있고, 모든 위협이 피격 0.5초 전 예고를 낸다 |
| **T8** | 미션 러너 + 목표/실패 판정 + 디브리핑 + 실패 원인 분석 | M2 1차수 클리어 가능 |
| **T9** | SP 경제 + 재고제 + 저장 + 로드아웃 화면 | 재접속 시 SP·재고 유지 |
| **T10** | i18n(CSV 로드) + 성능 패스 | 언어 전환 동작, 중급 폰 60fps |

> **T7 을 왜 쪼갰나**: GDD 4.5 는 위협 16종과 "모든 위협은 예고된다(최소 0.5초 텔레그래프)"는
> 규칙을 세웠는데, 원래 태스크 분할에는 위협 전용 자리가 없어 미션 러너 안에 흩어질 구조였다.
> 텔레그래프는 위협마다 재구현할 것이 아니라 **프레임워크가 강제해야 하는 계약**이다.
> 번호를 미루는 비용은 지금(T1·T2 시점)이 가장 싸다.

각 태스크: 구현 → 빌드 → 하네스 + Playwright 검증 → 스크린샷 확인 → 커밋(`T3: flight models`) → `DEVLOG.md` 갱신.

## 7. 마일스톤

- **v0.1** (T1~T6): 조작 가능한 저화질 FPV 비행 + 열화상 — *재미 검증 지점*
- **v0.2** (T7~T10): 위협 + M2 미션 완주 + 경제 루프
- **v0.3**: 작전 요청(일일 랜덤), 위협 3종
- **v0.5**: 타격 편대(StrikePackage), 미션 5종
- **v1.0**: 9미션 3차수, 4개국어, Capacitor 검토

## 7-2. three r128 → r180 이식 시 보정한 것

프로토타입은 r128 CDN, 코드베이스는 npm r180 이다. 그 사이 바뀐 기본값 때문에
**코드를 그대로 옮기면 화면이 달라진다.** 아래 둘은 프로토타입 룩을 기준으로 되돌린 것이다.

1. **색 관리 비활성** (`THREE.ColorManagement.enabled = false`, `outputColorSpace = LinearSRGB`).
   r155+ 는 색 관리가 기본이지만, 우리 파이프라인은 씬을 RT 에 그린 뒤 **원시 ShaderMaterial** 로
   합성한다. 원시 셰이더에는 three 가 출력 변환을 주입하지 않아 화면이 통째로 어두워진다.
2. **조명 강도 × π** (`LIGHT_SCALE`). r155 에서 조명이 물리 단위로 바뀌어(`useLegacyLights` 제거)
   같은 intensity 가 약 π배 어둡다.

→ 둘 다 "정식 선형 워크플로"로 가는 선택지가 있으나, **후처리 튜닝 파라미터를 다시 잡아야 한다.**
화면 감성 파라미터 확정(8장)과 함께 결정할 일이다.

## 8. 열려 있는 결정

> 서버 함수(`api/`)와 클라우드 세이브는 한 번 구현했다가 **걷어냈다** (2026-08-26, 사용자 결정).
> 다시 붙일 때는 DEVLOG 의 `5f253a8` 기록을 먼저 읽을 것 — Vercel 배포에서만 재현되는
> 함정 3종(`type: module` / 상대 import 확장자 / 루트 tsconfig 의 `noEmit`)이 정리돼 있다.


- 화면 감성 파라미터 최종값 (프로토타입 튜닝 패널에서 확정 후 `src/data/`에 고정)
- 실사 텍스처(CC0) 도입 시점 — 재미 검증 이후
- 사운드 3종(확인킬음/SP틱/유폭) 구현 시점
- Rapier.js / Capacitor 도입 여부
