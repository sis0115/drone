// db/001_init.sql 을 그대로 인라인한 것. **원본은 db/001_init.sql 이고 이 파일은 사본이다.**
// 파일로 읽지 않는 이유: 서버리스 함수 번들에 db/ 가 포함되지 않아 배포 환경에서 반드시 ENOENT 가 난다.
// tests/schema-sync.spec.ts 가 둘이 어긋나면 실패시킨다.
export const SCHEMA_SQL = String.raw`-- 클라우드 세이브 스키마 v1
--
-- 계정 없는 설계. 신원은 **기기별 시크릿**이다:
--   기기 -> secret (베어러 토큰) -> profile_devices -> profiles
-- 시크릿은 sha256 으로만 보관한다. 조회를 해시 기본키로 하므로
-- 평문 비교가 없고 타이밍 공격 표면도 없다.
--
-- 기기마다 별도 시크릿을 두는 이유: 이어하기 코드로 2번째 기기가 붙을 때
-- 시크릿을 회전시키면 원래 기기가 튕긴다. 기기별로 발급하면 둘 다 살아 있고,
-- 나중에 기기 하나만 해지하는 것도 가능하다.

create table if not exists profiles (
  id             uuid        primary key default gen_random_uuid(),
  -- 낙관적 잠금용 리비전. push 는 baseRev 가 현재 rev 와 같을 때만 통과한다.
  rev            integer     not null default 0,
  schema_version integer     not null default 1,
  data           jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists profile_devices (
  secret_hash  text        primary key,
  profile_id   uuid        not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists profile_devices_profile_idx on profile_devices (profile_id);

-- 기기 간 이어하기용 1회성 단축 코드. 평문 보관 금지, 짧은 TTL.
create table if not exists link_codes (
  code_hash  text        primary key,
  profile_id uuid        not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists link_codes_expires_idx on link_codes (expires_at);
create index if not exists link_codes_profile_idx on link_codes (profile_id);

-- 코드 무차별 대입 차단용 실패 기록.
create table if not exists link_attempts (
  ip text        not null,
  at timestamptz not null default now()
);
create index if not exists link_attempts_ip_at_idx on link_attempts (ip, at);
`;
