import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  isSafeUrl,
  normalizeLink,
  makeExcerpt,
  toJstIso,
  jstDate,
  jstTime,
  addDays,
  weekday,
  formatItemTime,
} from '../src/util.js';

test('escapeHtml: <script> と引用符をエスケープする', () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script>'&`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;',
  );
  assert.equal(escapeHtml(null), '');
});

test('isSafeUrl: http/https だけを許可する', () => {
  assert.equal(isSafeUrl('https://example.com/a'), true);
  assert.equal(isSafeUrl('http://example.com/a'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl(' JavaScript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,<b>x</b>'), false);
  assert.equal(isSafeUrl('/relative'), false);
  assert.equal(isSafeUrl(undefined), false);
});

test('normalizeLink: # と utm_* を取り除く', () => {
  assert.equal(
    normalizeLink('  https://example.com/a?id=3&utm_source=rss&UTM_Medium=x#top '),
    'https://example.com/a?id=3',
  );
  assert.equal(normalizeLink('https://example.com/a?utm_source=rss'), 'https://example.com/a');
});

test('makeExcerpt: タグを除き、空白を詰め、実体参照を戻す', () => {
  assert.equal(makeExcerpt('<p>Hello&nbsp;<b>world</b></p>\n\n<script>x()</script> &amp; more'), 'Hello world & more');
  assert.equal(makeExcerpt(undefined), '');
});

test('makeExcerpt: 絵文字を含む文を120字で切り詰める（絵文字を壊さない）', () => {
  const text = '👨‍👩‍👧'.repeat(130);
  const out = makeExcerpt(text);
  const chars = Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(out));
  assert.equal(chars.length, 120);
  assert.ok(out.endsWith('…'));
  assert.ok(out.startsWith('👨‍👩‍👧'));
  assert.equal(makeExcerpt('あ'.repeat(120)), 'あ'.repeat(120));
});

test('JST: UTC の 21:00 は JST の翌日 06:00', () => {
  const utc = '2026-11-19T21:00:00Z';
  assert.equal(jstDate(utc), '2026-11-20');
  assert.equal(jstTime(utc), '06:00');
  assert.equal(toJstIso(utc), '2026-11-20T06:00:00+09:00');
  assert.equal(toJstIso('Thu, 19 Nov 2026 21:00:00 GMT'), '2026-11-20T06:00:00+09:00');
  assert.equal(toJstIso('not a date'), null);
  assert.equal(toJstIso(undefined), null);
});

test('addDays と weekday', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekday('2026-11-20'), '金');
});

test('formatItemTime: 前日より前なら日付も出す', () => {
  assert.equal(formatItemTime('2026-11-20T05:40:00+09:00', '2026-11-20'), '05:40');
  assert.equal(formatItemTime('2026-11-19T23:10:00+09:00', '2026-11-20'), '23:10');
  assert.equal(formatItemTime('2026-11-18T23:10:00+09:00', '2026-11-20'), '11/18 23:10');
  assert.equal(formatItemTime(null, '2026-11-20'), '');
});
