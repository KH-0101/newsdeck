import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeedXml, fetchFeed, decodeBody, USER_AGENT } from '../src/fetch.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const AT = '2026-11-20T06:03:12+09:00';

test('RSS 2.0 を整える', async () => {
  const r = await parseFeedXml('t', fixture('rss2.xml'), AT);
  assert.equal(r.status, 'ok');
  assert.equal(r.error, null);
  assert.equal(r.items.length, 3, 'javascript: のリンクは捨てる');
  const [a, pr, empty] = r.items;
  assert.deepEqual(a, {
    id: 'news-1',
    title: '普通の記事 & 記号',
    link: 'https://example.com/news/1',
    excerpt: '本文のはじめの部分です。',
    publishedAt: '2026-11-20T06:00:00+09:00',
    fetchedAt: AT,
    summary: null,
    categories: ['政治'],
  });
  assert.equal(pr.id, 'https://example.com/news/2', 'guid が無ければリンクを使う');
  assert.deepEqual(pr.categories, ['PR']);
  assert.equal(empty.title, '');
  assert.equal(empty.publishedAt, null, '解釈できない日時は null');
});

test('Atom を整える', async () => {
  const r = await parseFeedXml('t', fixture('atom.xml'), AT);
  assert.equal(r.status, 'ok');
  assert.equal(r.items.length, 1);
  const [e] = r.items;
  assert.equal(e.id, 'tag:blog.example.com,2026:hello');
  assert.equal(e.link, 'https://blog.example.com/posts/hello');
  assert.equal(e.excerpt, 'Atom の要約です。');
  assert.equal(e.publishedAt, '2026-11-19T18:30:00+09:00');
  assert.deepEqual(e.categories, ['release']);
});

test('RSS 1.0（RDF）を整える。dc:date と dc:subject を使う', async () => {
  const r = await parseFeedXml('t', fixture('rdf.xml'), AT);
  assert.equal(r.status, 'ok');
  const [e] = r.items;
  assert.equal(e.title, 'RDF の記事');
  assert.equal(e.link, 'https://news.example.jp/a/100');
  assert.equal(e.publishedAt, '2026-11-20T05:40:00+09:00');
  assert.equal(e.excerpt, 'RDF の説明文です。');
  assert.deepEqual(e.categories, ['社会']);
});

test('解釈できない XML は status: error', async () => {
  for (const name of ['broken.xml', 'not-feed.html']) {
    const r = await parseFeedXml('t', fixture(name), AT);
    assert.equal(r.status, 'error', name);
    assert.equal(r.error, 'parse error');
    assert.deepEqual(r.items, []);
  }
});

const feed = { id: 'x', url: 'https://example.com/rss' };
const okResponse = (body) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer });

test('fetchFeed: User-Agent を付けて取得する', async () => {
  let seen;
  const r = await fetchFeed(feed, {
    fetchedAt: AT,
    fetchImpl: async (url, opts) => {
      seen = { url, opts };
      return okResponse(fixture('atom.xml'));
    },
  });
  assert.equal(r.status, 'ok');
  assert.equal(seen.url, feed.url);
  assert.equal(seen.opts.headers['User-Agent'], USER_AGENT);
});

test('fetchFeed: HTTP エラー、タイムアウト、通信エラーを理由つきで返す', async () => {
  const notFound = await fetchFeed(feed, { fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.deepEqual(notFound, { feedId: 'x', status: 'error', error: 'http 404', items: [] });

  const timeout = await fetchFeed(feed, {
    timeoutMs: 20,
    fetchImpl: (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
  });
  assert.equal(timeout.error, 'timeout');

  const network = await fetchFeed(feed, { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(network.error, 'network error');
});

test('decodeBody: XML 宣言の文字コードで読む', () => {
  // 「あ」の Shift_JIS は 0x82 0xA0
  const head = new TextEncoder().encode('<?xml version="1.0" encoding="Shift_JIS"?><t>');
  const buf = new Uint8Array([...head, 0x82, 0xa0]);
  assert.ok(decodeBody(buf).endsWith('あ'));
});
