import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeDay, writeDay, readDay, listDates, pruneOld, readRecent } from '../src/store.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'newsdeck-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const day = (date) => ({ date, runs: [`${date}T06:00:00+09:00`], sources: [] });

test('mergeDay: 初回は新しく作り、2回目は追記する', () => {
  const first = mergeDay(null, '2026-11-20', 'r1', [
    { feedId: 'a', status: 'ok', error: null, items: [{ id: '1' }], excluded: [] },
  ]);
  assert.deepEqual(first.runs, ['r1']);
  const second = mergeDay(first, '2026-11-20', 'r2', [
    { feedId: 'a', status: 'error', error: 'timeout', items: [], excluded: [] },
    { feedId: 'b', status: 'ok', error: null, items: [{ id: '9' }], excluded: [{ id: 'p' }] },
  ]);
  assert.deepEqual(second.runs, ['r1', 'r2']);
  assert.deepEqual(second.sources[0], { feedId: 'a', status: 'error', error: 'timeout', items: [{ id: '1' }], excluded: [] });
  assert.equal(second.sources[1].feedId, 'b');
  assert.equal(first.sources[0].status, 'ok', '元のデータは変更しない');
});

test('書いて読める。無い日は null', async () => {
  await withTempDir(async (dir) => {
    await writeDay(join(dir, 'data'), day('2026-11-20'));
    assert.deepEqual(await readDay(join(dir, 'data'), '2026-11-20'), day('2026-11-20'));
    assert.equal(await readDay(join(dir, 'data'), '2026-11-19'), null);
    assert.deepEqual(await listDates(join(dir, 'nothing')), []);
  });
});

test('31日前のファイルは消え、30日前のファイルは残る', async () => {
  await withTempDir(async (dir) => {
    for (const d of ['2026-10-20', '2026-10-21', '2026-11-19', '2026-11-20']) await writeDay(dir, day(d));
    const removed = await pruneOld(dir, '2026-11-20');
    assert.deepEqual(removed, ['2026-10-20']);
    assert.deepEqual((await readdir(dir)).sort(), ['2026-10-21.json', '2026-11-19.json', '2026-11-20.json']);
  });
});

test('readRecent: 保持期間内を古い順に読み、関係ないファイルは無視する', async () => {
  await withTempDir(async (dir) => {
    for (const d of ['2026-10-01', '2026-11-19', '2026-11-18']) await writeDay(dir, day(d));
    const days = await readRecent(dir, '2026-11-20');
    assert.deepEqual(days.map((x) => x.date), ['2026-11-18', '2026-11-19']);
  });
});
