// data/YYYY-MM-DD.json の読み書き。ファイルの入出力はここに閉じ込める。

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addDays } from './util.js';

export const KEEP_DAYS = 30;
const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** 保持する最も古い日付。today から KEEP_DAYS 日前までを残す。 */
export function oldestKept(today, keepDays = KEEP_DAYS) {
  return addDays(today, -keepDays);
}

/**
 * その日のデータに今回の実行結果を追記する（純粋関数）。上書きはしない。
 * 同じ情報源が既にあれば記事を足し、status と error は今回の実行のものにする。
 */
export function mergeDay(existing, date, runAt, sources) {
  const base = existing ?? { date, runs: [], sources: [] };
  const merged = base.sources.map((s) => ({ ...s, items: [...s.items], excluded: [...(s.excluded ?? [])] }));
  for (const src of sources) {
    const found = merged.find((s) => s.feedId === src.feedId);
    if (found) {
      found.status = src.status;
      found.error = src.error;
      found.items.push(...src.items);
      found.excluded.push(...src.excluded);
    } else {
      merged.push({ feedId: src.feedId, status: src.status, error: src.error, items: [...src.items], excluded: [...src.excluded] });
    }
  }
  return { date, runs: [...base.runs, runAt], sources: merged };
}

/** data/ にある日付の一覧（古い順）。 */
export async function listDates(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return names.map((n) => FILE_PATTERN.exec(n)?.[1]).filter(Boolean).sort();
}

/** その日のデータ。無ければ null。 */
export async function readDay(dir, date) {
  try {
    return JSON.parse(await readFile(join(dir, `${date}.json`), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeDay(dir, day) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${day.date}.json`), JSON.stringify(day, null, 2) + '\n', 'utf8');
}

/** 保持期間を過ぎたファイルを削除し、削除した日付を返す。 */
export async function pruneOld(dir, today, keepDays = KEEP_DAYS) {
  const limit = oldestKept(today, keepDays);
  const old = (await listDates(dir)).filter((d) => d < limit);
  await Promise.all(old.map((d) => rm(join(dir, `${d}.json`))));
  return old;
}

/** 保持期間内（today を含む）のデータを古い順に読む。 */
export async function readRecent(dir, today, keepDays = KEEP_DAYS) {
  const limit = oldestKept(today, keepDays);
  const dates = (await listDates(dir)).filter((d) => d >= limit && d <= today);
  return Promise.all(dates.map((d) => readDay(dir, d)));
}
