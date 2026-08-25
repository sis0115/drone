// 로컬라이즈 원본은 docs/strings_master.csv 단일 출처를 그대로 읽는다.
// 문서를 고치면 빌드가 따라온다 — 복사본을 만들지 말 것.
import csvText from '../../docs/strings_master.csv?raw';
import { parseCsv } from './csv';

export type Locale = 'ko' | 'en';
export const LOCALES: Locale[] = ['ko', 'en'];

const table = new Map<string, Record<string, string>>();
let current: Locale = 'ko';

function build(): void {
  const rows = parseCsv(csvText.trim());
  const header = rows[0].map((h) => h.trim());
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    const entry: Record<string, string> = {};
    for (let c = 1; c < header.length; c++) entry[header[c]] = row[c] ?? '';
    table.set(row[0].trim(), entry);
  }
}
build();

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** 키가 없으면 키 자체를 돌려준다 — 화면에서 누락이 바로 보인다. */
export function t(key: string, locale: Locale = current): string {
  return table.get(key)?.[locale] || table.get(key)?.ko || key;
}

export function has(key: string): boolean {
  return table.has(key);
}

export function keys(): string[] {
  return [...table.keys()];
}
