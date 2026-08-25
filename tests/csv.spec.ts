import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/i18n/csv';

/** i18n 원본이 KO/EN 양쪽 다 채워져 있는지 — 누락은 화면에서 키가 그대로 보이게 된다. */
test('strings_master.csv — 모든 키에 ko/en 값이 있다', () => {
  const rows = parseCsv(readFileSync('docs/strings_master.csv', 'utf8').trim());
  const [header, ...body] = rows;

  expect(header).toEqual(['key', 'ko', 'en']);
  expect(body.length).toBeGreaterThan(0);

  const missing = body.filter((r) => !r[0] || !r[1] || !r[2]).map((r) => r[0]);
  expect(missing, `값이 빈 키: ${missing.join(', ')}`).toEqual([]);

  const keys = body.map((r) => r[0]);
  expect(new Set(keys).size, '중복 키 존재').toBe(keys.length);
});
