import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDayPage, renderArchive, sortItems, trialStats, groupSources } from '../src/render.js';

const feeds = [
  { id: 'nhk', name: 'NHK', category: '一般', trial: false, lang: 'ja' },
  { id: 'empty', name: '静かな情報源', category: '一般', trial: false, lang: 'ja' },
  { id: 'gh', name: 'GitHub Blog', category: '技術', trial: true, addedAt: '2026-11-19', lang: 'en' },
  { id: 'down', name: '落ちている情報源', category: 'セキュリティ', trial: false, lang: 'ja' },
];

const item = (n, publishedAt = null, over = {}) => ({
  id: `id-${n}`,
  title: `記事${n}`,
  link: `https://example.com/${n}`,
  excerpt: `抜粋${n}`,
  publishedAt,
  fetchedAt: '2026-11-20T06:03:12+09:00',
  summary: null,
  ...over,
});

const day = {
  date: '2026-11-20',
  runs: ['2026-11-20T06:03:12+09:00', '2026-11-20T08:15:00+09:00'],
  sources: [
    {
      feedId: 'nhk',
      status: 'ok',
      error: null,
      items: [
        item(1, '2026-11-20T05:12:00+09:00'),
        item(2, '2026-11-20T05:40:00+09:00'),
        item(3, null, { title: '<img src=x onerror=alert(1)>' }),
        item(4, '2026-11-18T10:00:00+09:00', { link: 'javascript:alert(1)' }),
        item(5, null, { title: '' }),
      ],
      excluded: [{ id: 'p', title: '【PR】広告です', link: 'https://example.com/pr', matched: 'PR' }],
    },
    { feedId: 'empty', status: 'ok', error: null, items: [], excluded: [] },
    { feedId: 'gh', status: 'ok', error: null, items: [item(6, '2026-11-19T22:00:00+09:00')], excluded: [] },
    { feedId: 'down', status: 'error', error: 'timeout', items: [], excluded: [] },
    { feedId: 'gone', status: 'ok', error: null, items: [item(7)], excluded: [] },
  ],
};

test('日付ページ: noindex、日付、更新時刻、件数、前日・翌日リンク', () => {
  const html = renderDayPage({ day, feeds, prevDate: '2026-11-19', nextDate: null });
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /2026-11-20 \(金\)/);
  assert.match(html, /更新 08:15/, '最後の実行時刻');
  assert.match(html, /新着 <strong>7<\/strong>件/);
  assert.match(html, /失敗 1件/);
  assert.match(html, /href="2026-11-19.html" rel="prev"/);
  assert.match(html, /aria-disabled="true">翌日 →/);
});

test('日付ページ: タイトルのタグはエスケープされ、javascript: はリンクにならない', () => {
  const html = renderDayPage({ day, feeds });
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /<span class="item-title">記事4<\/span>/);
});

test('日付ページ: 新着なし、取得失敗、お試し、PR除外、登録解除を表示する', () => {
  const html = renderDayPage({ day, feeds });
  assert.match(html, /静かな情報源[\s\S]*?新着なし/);
  assert.match(html, /⚠ 取得失敗（timeout）/);
  assert.match(html, /GitHub Blog[\s\S]*?お試し/);
  assert.match(html, /<section class="source" lang="en">/);
  assert.match(html, /<summary>PR除外 1件<\/summary>/);
  assert.match(html, /gone（登録解除）/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test('日付ページ: タイトルが空ならリンクを表示し、古い記事は日付つきの時刻', () => {
  const html = renderDayPage({ day, feeds });
  assert.match(html, />https:\/\/example.com\/5<\/a>/);
  assert.match(html, />11\/18 10:00</);
  assert.match(html, />05:40</);
});

test('日付ページ: 21件目以降は折りたたむ', () => {
  const many = Array.from({ length: 23 }, (_, i) => item(i, `2026-11-20T05:${String(59 - i).padStart(2, '0')}:00+09:00`));
  const html = renderDayPage({
    day: { date: '2026-11-20', runs: [], sources: [{ feedId: 'nhk', status: 'ok', error: null, items: many, excluded: [] }] },
    feeds,
  });
  assert.match(html, /<summary>ほか 3件<\/summary>/);
  const before = html.split('<details class="more">')[0];
  assert.equal((before.match(/class="item"/g) ?? []).length, 20);
});

test('sortItems: 新しい順、公開日時なしは末尾', () => {
  const out = sortItems([item(1, null), item(2, '2026-11-20T01:00:00+09:00'), item(3, '2026-11-20T03:00:00+09:00')]);
  assert.deepEqual(out.map((i) => i.id), ['id-3', 'id-2', 'id-1']);
});

test('groupSources: カテゴリ順、その中は feeds.json の順', () => {
  const groups = groupSources(day, feeds);
  assert.deepEqual(groups.map((g) => g.category), ['一般', '技術', 'セキュリティ', '登録解除']);
  assert.deepEqual(groups[0].entries.map((e) => e.feed.id), ['nhk', 'empty']);
});

test('trialStats: 直近14日（登録日以降）の平均と PR除外件数', () => {
  const days = [
    { date: '2026-11-18', sources: [{ feedId: 'gh', items: [item(1)], excluded: [] }] },
    { date: '2026-11-19', sources: [{ feedId: 'gh', items: [item(1), item(2), item(3)], excluded: [{ id: 'x' }] }] },
    { date: '2026-11-20', sources: [{ feedId: 'gh', items: [item(4)], excluded: [] }] },
  ];
  assert.deepEqual(trialStats(feeds[2], days, '2026-11-20'), { days: 2, average: 2, excluded: 1 });
});

test('archive: 新しい順で件数つき。1日分だけでも壊れない', () => {
  const html = renderArchive({ days: [day, { date: '2026-11-19', runs: [], sources: [] }] });
  assert.match(html, /noindex, nofollow/);
  assert.ok(html.indexOf('2026-11-20.html') < html.indexOf('2026-11-19.html'));
  assert.match(html, /新着 7件/);
  assert.match(renderArchive({ days: [day] }), /2026-11-20 \(金\)/);
  assert.match(renderArchive({ days: [] }), /データがありません/);
});

test('データが1日分だけでも日付ページは壊れない', () => {
  const html = renderDayPage({ day: { date: '2026-11-20', runs: [], sources: [] }, feeds });
  assert.match(html, /データがありません/);
  assert.match(html, /更新 —/);
});

test('maxItems があれば、その件数を超えた分を折りたたむ', () => {
  const few = Array.from({ length: 8 }, (_, i) => item(i, `2026-11-20T05:${String(59 - i).padStart(2, '0')}:00+09:00`));
  const html = renderDayPage({
    day: { date: '2026-11-20', runs: [], sources: [{ feedId: 'nhk', status: 'ok', error: null, items: few, excluded: [] }] },
    feeds: [{ ...feeds[0], maxItems: 5 }],
  });
  assert.match(html, /<summary>ほか 3件<\/summary>/);
  assert.match(html, /<span class="count">8<\/span>/, '件数は全体の数');
});
