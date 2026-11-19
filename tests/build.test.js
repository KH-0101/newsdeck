import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/build.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const config = {
  excludeKeywords: ['PR'],
  feeds: [
    { id: 'rss', name: 'RSS', url: 'https://example.com/rss2.xml', category: '一般' },
    { id: 'atom', name: 'Atom', url: 'https://example.com/atom.xml', category: '技術' },
    { id: 'dead', name: 'Dead', url: 'https://example.com/404', category: 'セキュリティ' },
  ],
};

function fakeFetch(files) {
  return async (url) => {
    const name = url.split('/').pop();
    if (!(name in files)) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(files[name]).buffer };
  };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'newsdeck-build-'));
  await writeFile(join(root, 'feeds.json'), JSON.stringify(config));
  return root;
}

const quiet = () => {};

test('data/ と public/ ができ、2回目の実行では追加分だけが新着になる', async () => {
  const root = await setup();
  try {
    const files = { 'rss2.xml': await fixture('rss2.xml'), 'atom.xml': await fixture('atom.xml') };
    const now = new Date('2026-11-19T21:00:00Z'); // JST 2026-11-20 06:00

    const first = await run({ root, now, fetchImpl: fakeFetch(files), log: quiet });
    assert.deepEqual(first, { date: '2026-11-20', added: 3, failed: 1, total: 3, allFailed: false });

    const second = await run({ root, now: new Date('2026-11-19T23:00:00Z'), fetchImpl: fakeFetch(files), log: quiet });
    assert.equal(second.added, 0);

    const data = JSON.parse(await readFile(join(root, 'data', '2026-11-20.json'), 'utf8'));
    assert.deepEqual(data.runs, ['2026-11-20T06:00:00+09:00', '2026-11-20T08:00:00+09:00']);
    const rss = data.sources.find((s) => s.feedId === 'rss');
    assert.equal(rss.items.length, 2);
    assert.equal(rss.excluded.length, 1, '【PR】の記事は除外して記録する');
    assert.equal(data.sources.find((s) => s.feedId === 'dead').error, 'http 404');

    const pub = (await readdir(join(root, 'public'))).sort();
    assert.deepEqual(pub, ['2026-11-20.html', 'archive.html', 'index.html', 'robots.txt', 'style.css']);
    const index = await readFile(join(root, 'public', 'index.html'), 'utf8');
    assert.match(index, /⚠ 取得失敗（http 404）/);
    assert.match(index, /PR除外 1件/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('翌日は前日の記事を新着にせず、前日へのリンクができる', async () => {
  const root = await setup();
  try {
    const files = { 'rss2.xml': await fixture('rss2.xml'), 'atom.xml': await fixture('atom.xml') };
    await run({ root, now: new Date('2026-11-19T21:00:00Z'), fetchImpl: fakeFetch(files), log: quiet });
    const next = await run({ root, now: new Date('2026-11-20T21:00:00Z'), fetchImpl: fakeFetch(files), log: quiet });
    assert.equal(next.date, '2026-11-21');
    assert.equal(next.added, 0);
    const index = await readFile(join(root, 'public', 'index.html'), 'utf8');
    assert.match(index, /href="2026-11-20.html" rel="prev"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('すべて失敗したら allFailed', async () => {
  const root = await setup();
  try {
    const r = await run({ root, now: new Date('2026-11-19T21:00:00Z'), fetchImpl: fakeFetch({}), log: quiet });
    assert.equal(r.allFailed, true);
    assert.match(await readFile(join(root, 'public', 'index.html'), 'utf8'), /失敗 3件/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
