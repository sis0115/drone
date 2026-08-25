import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SCHEMA_SQL } from '../api/_lib/schema';

/**
 * `api/_lib/schema.ts` 는 `db/001_init.sql` 의 사본이다.
 * 사본이 존재하는 이유는 서버리스 번들에 db/ 가 실리지 않기 때문이고,
 * 사본인 이상 어긋날 수 있으므로 여기서 막는다.
 */
test('인라인 스키마가 db/001_init.sql 과 일치한다', () => {
  const onDisk = readFileSync('db/001_init.sql', 'utf8');
  expect(SCHEMA_SQL.trim()).toBe(onDisk.trim());
});
