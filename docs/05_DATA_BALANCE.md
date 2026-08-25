# 데이터 스키마 & 밸런싱 v0.1 — 「SIGNAL LOST: FPV」

> 목적: 모든 세션이 같은 데이터 구조 위에서 코딩하게 하는 단일 기준. 스키마 변경은 반드시 이 문서 먼저 수정 → 코드 반영.

---

## 1. 데이터 계층 구조

```
[정적 데이터 — ScriptableObject, 빌드에 포함]
  DroneFrameDef / ModuleDef / PayloadDef / MissionDef / ChapterDef

[동적 데이터 — 로컬 저장 JSON (v1.0까지), 이후 클라우드 백업]
  PlayerProfile (진행/보유/쿼터 상태)

[런타임 전용 — 저장 안 함]
  MissionRuntimeState (현재 미션 진행 상태)
```

저장 위치: localStorage `slfpv.save.v1` + 백업 1세대(`slfpv.save.v1.bak`). 저장 시점: 디브리핑 확정, 보급 승인(구매), 설정 변경. **스키마에 `schemaVersion` 필드 필수** — 업데이트 마이그레이션 대비.

> **갱신 (2026-08-25)**: "클라우드 백업은 v1.0 이후"였던 항목을 앞당겨 **v0.2에서 구현**했다.
> 로컬 저장이 여전히 게임플레이의 원본이고, 클라우드는 그 위에 얹은 동기화 계층이다 —
> 오프라인이거나 서버가 죽어도 게임은 그대로 돌아간다.
> 계정은 만들지 않았다. 신원은 기기별 시크릿이고 기기 간 이동은 이어하기 코드로 한다.
> 서버 스키마와 프로토콜은 02 문서 7-1장 참조.

## 2. 정적 데이터 스키마 (ScriptableObject)

### 2.1 DroneFrameDef (기체)
```
id: string            // "frame.sparrow7"  ← 로컬라이즈 키와 동일 규칙
tier: int             // 1~5
nameKey: string       // "item.frame.sparrow7.name"
physics: DroneSpec 참조 (개발설계서 3.4의 물리 파라미터 SO)
payloadSlots: int     // 탄두 장착 수
moduleSlots: [Camera, Power, Link]  // 허용 슬롯
tags: [string]        // "recon", "night", "fiber", "longrange" — 임무 적합도 매칭용
priceSp: int
blueprintSprite: Sprite  // 청사진 라인 드로잉
```

### 2.2 ModuleDef (모듈) / PayloadDef (탄두)
```
ModuleDef: id, slotType(Camera|Power|Link), tier, nameKey, priceSp, tags,
           statMods { batteryMult, windResist, signalQualityBonus, camMode(BW|Color|HD|Thermal|Dual) }
PayloadDef: id, nameKey, costSpPerUnit(소모품), damageType(HEAT|Frag|Incendiary|Grenade|Smoke),
            damageVsArmor / damageVsSoft / damageVsAir, weight(물리 영향)
```

### 2.3 MissionDef (미션 차수 1개 = 1 에셋)
```
id: "m2.tier1"                 // 미션.차수
type: enum { Strike, Chase, Recon, DeepStrike, FiberHunt, Drop, ShotgunZone, Intercept, Interdiction }
                               // M1~M9 대응
chapterId: "ch1"
briefKeys: { title, situation, objective, tip, flavor }   // 로컬라이즈 키 5종
constraints: [enum { Wind, EW, Night, BatteryPressure }]   // 차수별 추가 제약 (GDD 6.1)
objectives: [ { targetType, count, isBonus } ]
rewards: { baseSp, starBonusSp, firstClearUnlockId? }
mapScene: string / spawnTable: 적 배치 테이블 ID
requiredTier: int
```

### 2.4 ChapterDef
```
id, actNumber(1~3), missionIds[], unlockStarRequirement, storyRadioKeys[] (막간 무전)
```

## 3. 동적 데이터 — PlayerProfile (저장 JSON)

```json
{
  "schemaVersion": 1,
  "sp": 1240,
  "trustTier": 2,
  "trustProgress": 0.6,
  "ownedFrames": ["frame.sparrow7", "frame.hornet10"],
  "ownedModules": ["cam.analogColor", "pwr.hiDensity"],
  "payloadInventory": { "pl.heat": 6, "pl.frag": 3 },
  "loadout": { "frame": "frame.hornet10", "camera": "cam.analogColor",
               "power": "pwr.hiDensity", "link": "lnk.basic", "payloads": ["pl.heat","pl.heat"] },
  "campaign": { "m2.tier1": { "stars": 3, "cleared": true }, "m6.tier1": { "stars": 1, "cleared": true } },
  "weeklyQuota": { "weekId": "2026-W29", "goalType": "confirmedKills", "goal": 10, "progress": 6, "claimed": false },
  "dailyOps": { "dateId": "2026-07-15", "remaining": 2, "seeds": [8412, 1093, 5521] },
  "frontlineSupplyGauge": 0.82,
  "fleetStock": {
    "frame.hornet10": { "ready": 4, "restockQueue": ["2026-07-15T09:20:00Z", "2026-07-15T09:40:00Z"] },
    "frame.mavkaR":   { "ready": 1, "restockQueue": ["2026-07-15T10:05:00Z"] }
  },
  "maintenanceQueue": [ { "frameId": "frame.hornet10", "readyAt": "2026-07-15T08:55:00Z" } ],
  "supplyPriority": { "active": false, "expiresAt": null },
  "dailyInstantRestock": { "dateId": "2026-07-15", "used": 1, "limit": 2 },  "settings": { "lang": "ko", "stickMode": 2, "assist": "full", "haptics": true },
  "stats": { "totalKills": 41, "confirmedKills": 33, "framesLost": 12, "flightTimeSec": 9400 }
}
```

주의: `dailyOps.seeds` — 작전 요청은 시드 저장 방식(같은 날 재접속 시 동일 미션 재생성). 서버 없이 일일 콘텐츠 구현하는 핵심.

## 4. 초기 밸런싱 (v0.3에서 실측 후 조정 — 전부 리모트 컨피그 대상)

### 4.1 SP 획득 (표적 가치표)

| 표적 | 기본 SP | 확인 시(100%) | 비고 |
|---|---|---|---|
| 승용/경차량 | 20 | 40 | 오폭 위험 표적 |
| 군용 트럭 | 40 | 80 | |
| 연료차 | 60 | 120 | 유폭 연출 |
| 장갑차 | 70 | 140 | |
| 전차 | 100 | 200 | 약점 명중 시 +50% |
| 방공 시스템 | 150 | 300 | |
| 수송기 / 폭격기 | 250 / 400 | 500 / 800 | M1 전용 |
| 적 드론 요격 | 25/기 | — | M8, 확인 불필요 |
| 정찰 좌표 1건 | 60 | — | 고도 30m 이하 촬영 시 +50% |
| **민간 차량 오폭** | **-200 + 신뢰 진행도 -10%** | | M9 핵심 리스크 |

### 4.2 획득 속도 앵커 (경제의 기준점)

- 작전 요청 1회 평균 보상: **약 150 SP** (10분 플레이)
- 일일 작전 요청 3회 + 쿼터 진행 = **하루 약 500 SP**
- GDD 6.4 규칙 "캠페인 필수 장비 = 3~5일치" → **핵심 장비 가격대 1,500~2,500 SP**

### 4.3 장비 가격표 (초안)

| 티어 | 기체 | 모듈 | 예시 |
|---|---|---|---|
| T1 | 기본 지급 | 200~400 | 아날로그 컬러 300 |
| T2 | 800 | 500~800 | 호넷-10 800, 고밀도 셀 600 |
| T3 | 1,600 | 1,000~1,500 | 마브카-R 1,600, **열화상 1,800**(Ch.4 야간 관문) |
| T4 | 3,000 | 2,000~2,500 | 바바야가 NX 3,000, 스테디윙 2,200 |
| T5 | 5,000 | 3,000~4,000 | 위도우 스레드 5,000, 광섬유 릴 3,500 |

소모품: 성형작약 30/발, 파편탄 20, 소이탄 40, 수류탄 10, 연막 15. 기체 손실 페널티: 기체 가격의 5% SP 차감(회수 귀환 시 0).

### 4.3.1 기체 재고 / 입고 (GDD 6.6)

| 티어 | 상한 | 입고 | 정비(회수 시) |
|---|---|---|---|
| T1 | 무제한 | — | — |
| T2 | 6 | 20분 | 5분 |
| T3 | 4 | 45분 | 5분 |
| T4 | 3 | 90분 | 8분 |
| T5 | 2 | 3시간 | 10분 |

- 입고는 서버 시간 기준 절대시각(`restockQueue`)으로 저장 — 기기 시계 조작 방지 위해 v1.0에서 서버 시각 동기화 검토(그전까지는 최근 확인 시각보다 과거로 되돌아가면 무시).
- 즉시 입고 획득: ★3 클리어 +1, 주간 쿼터 달성 +2, 광고 일 2회, 보급 우선권 구독 +2/일 및 입고 시간 ×0.5.

### 4.3.2 보상 배율 계산 (GDD 6.7)

```
최종 SP = 기본 SP × min(2.5, 차수배율 + Σ도전보너스)
차수배율: 1차 1.0 / 2차 1.4 / 3차 1.8
도전보너스: 위협추가 +0.2×n(최대 3) / ACRO +0.2 / 하급기체 +0.3
            / 노히트 +0.3 / 회수귀환 +0.2 / 시간제한 +0.2
```
배율은 출격 전 확정. 도전 실패 시 기본 보상만 지급(추가 페널티 없음).

### 4.4 신뢰 등급 승급 요구치

| 등급 | 누적 확인 실적 | 개방 |
|---|---|---|
| T1→T2 | 확인 킬 10 | Ch.2~3, 작전 요청 B등급 |
| T2→T3 | 확인 킬 30 + 정찰 5건 | 2막, 열화상 상점 등록 |
| T3→T4 | 확인 킬 70 + M8 클리어 | 3막, 장거리 개조 |
| T4→T5 | 확인 킬 120 + 보급 게이지 50%↓ | 최종장, 광섬유 |

### 4.5 4대 제약 초기 수치

| 시스템 | 수치 |
|---|---|
| 배터리 | 기본 체공 180s(호버 기준), 풀스로틀 배율 2.0, 고밀도 셀 +30% |
| 바람 | 평시 0~2m/s 상시 표류, 돌풍 이벤트 6~9m/s 2초(예고 화면 흔들림 0.5초 선행), 스테디윙 = 체감 50% 감쇠 |
| EW | 재밍 구역: signalQuality 0.9→0.3 선형 감쇠(구역 중심 거리 기반), 입력 지연 최대 0.4s, 광섬유 = 무효 |
| 시야(신호) | 이륙점 거리 감쇠: 800m부터 저하 시작, 2km에서 0.4 (중계기 +1.5km) |

## 5. 이벤트 버스 (시스템 간 결합 규칙)

시스템 간 직접 참조 금지 — 아래 이벤트로만 통신 (v0.2 구현):

```
OnTargetDestroyed(targetType, byWeakspot)   → SP 계산, 쿼터, 통계
OnKillConfirmed(targetId)                   → SP 보정, 무전 플레이버
OnDroneLost(recovered: bool)                → 페널티, SIGNAL LOST 연출
OnSignalQualityChanged(float)               → FPVPostFX, OSD RSSI
OnMissionComplete(missionId, stars)         → 저장, 해금, 보급 게이지
OnQuotaProgress(current, goal)              → 홈 하단바, 장관 무전 트리거
```

## 6. 문서 체계 최종 점검 (개발 착수 전 체크리스트)

| 문서 | 상태 | 담당 범위 |
|---|---|---|
| GDD v0.2 | ✅ | 무엇을 만드나 |
| 개발 설계서 v0.1 | ✅ | 어떻게 만드나 (T1~T9) |
| 내러티브 v0.2 | ✅ | 무슨 이야기인가 (3막 9챕터) |
| UI/아트 스타일 가이드 v0.1 | ✅ | 어떻게 보이나 |
| 데이터 스키마 & 밸런싱 v0.1 | ✅ (본 문서) | 어떤 구조·수치인가 |
| strings_master.csv | ✅ | 로컬라이즈 원본 (프롤로그+Ch.1) |
| 사운드 리스트 | ⏸ v0.2에서 (스타일 가이드 1.5로 톤만 선정의) |
| 마케팅/스토어 문안 | ⏸ v0.5에서 |

→ **소스 착수 조건 충족.** 클로드 코드 세션 시작 시 컨텍스트 제공 순서: 개발설계서(해당 태스크 섹션) + 스타일 가이드(UI 태스크 시) + 본 문서(데이터 태스크 시).
