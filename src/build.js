// 入口。取得 → 除外 → 新着判定 → 保存 → HTML生成 をつなぐ（SPEC 2）。
// 使い方: node src/build.js

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig, ConfigError } from './config.js';
import { fetchAll } from './fetch.js';
import { filterItems } from './filter.js';
import { buildSeen, selectNew } from './dedupe.js';
import { mergeDay, readDay, readRecent, writeDay, pruneOld } from './store.js';
import { renderDayPage, renderArchive, CSS, ROBOTS_TXT } from './render.js';
import { jstDate, toJstIso } from './util.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 取得結果を、除外と新着判定を済ませた保存用の形にする（純粋関数）。 */
export function processResults(results, config, seen) {
  const feedById = new Map(config.feeds.map((f) => [f.id, f]));
  return results.map((r) => {
    const feed = feedById.get(r.feedId);
    const { items, excluded } = filterItems(r.items, [...config.excludeKeywords, ...(feed?.excludeKeywords ?? [])]);
    return {
      feedId: r.feedId,
      status: r.status,
      error: r.error,
      items: selectNew(r.feedId, items, seen),
      excluded: selectNew(r.feedId, excluded, seen),
    };
  });
}

/** public/ を作り直す。 */
export async function writeSite(publicDir, days, feeds) {
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const writes = sorted.map((day, i) => {
    const html = renderDayPage({
      day,
      feeds,
      days: sorted,
      prevDate: sorted[i - 1]?.date ?? null,
      nextDate: sorted[i + 1]?.date ?? null,
    });
    const files = [writeFile(join(publicDir, `${day.date}.html`), html, 'utf8')];
    if (i === sorted.length - 1) files.push(writeFile(join(publicDir, 'index.html'), html, 'utf8'));
    return Promise.all(files);
  });
  if (sorted.length === 0) {
    writes.push(writeFile(join(publicDir, 'index.html'), renderArchive({ days: [] }), 'utf8'));
  }
  writes.push(
    writeFile(join(publicDir, 'archive.html'), renderArchive({ days: sorted }), 'utf8'),
    writeFile(join(publicDir, 'style.css'), CSS, 'utf8'),
    writeFile(join(publicDir, 'robots.txt'), ROBOTS_TXT, 'utf8'),
  );
  await Promise.all(writes);
}

/**
 * 全体を1回実行する。
 * @returns {{ date: string, added: number, failed: number, total: number, allFailed: boolean }}
 */
export async function run({ root = ROOT, now = new Date(), fetchImpl, log = console.log } = {}) {
  const dataDir = join(root, 'data');
  const publicDir = join(root, 'public');
  const config = validateConfig(JSON.parse(await readFile(join(root, 'feeds.json'), 'utf8')));
  const date = jstDate(now);
  const runAt = toJstIso(now);

  const results = await fetchAll(config.feeds, { fetchedAt: runAt, ...(fetchImpl ? { fetchImpl } : {}) });
  const seen = buildSeen(await readRecent(dataDir, date));
  const sources = processResults(results, config, seen);

  await writeDay(dataDir, mergeDay(await readDay(dataDir, date), date, runAt, sources));
  const removed = await pruneOld(dataDir, date);
  await writeSite(publicDir, await readRecent(dataDir, date), config.feeds);

  for (const s of sources) {
    const state = s.status === 'ok' ? 'ok   ' : `error（${s.error}）`;
    log(`${s.feedId.padEnd(18)} ${state} 新着 ${s.items.length}件  PR除外 ${s.excluded.length}件`);
  }
  if (removed.length) log(`古いデータを削除: ${removed.join(', ')}`);
  const failed = sources.filter((s) => s.status === 'error').length;
  const added = sources.reduce((n, s) => n + s.items.length, 0);
  log(`${date}: 新着 ${added}件、失敗 ${failed}/${sources.length}件`);
  return { date, added, failed, total: sources.length, allFailed: failed === sources.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await run();
    if (result.allFailed) {
      console.error('すべてのフィードの取得に失敗しました');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e instanceof ConfigError ? e.message : e);
    process.exitCode = 1;
  }
}
