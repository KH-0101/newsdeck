import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeen, selectNew } from '../src/dedupe.js';
import { normalizeItem } from '../src/fetch.js';

const it = (id) => ({ id, title: id, link: `https://example.com/${id}` });

test('過去30日に出た記事は除き、新着だけを返す', () => {
  const past = [
    { date: '2026-11-18', sources: [{ feedId: 'a', items: [it('1')], excluded: [] }] },
    { date: '2026-11-19', sources: [{ feedId: 'a', items: [], excluded: [{ ...it('pr'), matched: 'PR' }] }] },
  ];
  const seen = buildSeen(past);
  const out = selectNew('a', [it('1'), it('2'), it('pr')], seen);
  assert.deepEqual(out.map((x) => x.id), ['2']);
});

test('別の情報源の同じ id は既出とみなさない', () => {
  const seen = buildSeen([{ sources: [{ feedId: 'a', items: [it('1')] }] }]);
  assert.deepEqual(selectNew('b', [it('1')], seen).map((x) => x.id), ['1']);
});

test('同じ日の2回目の実行では追加分だけが返る', () => {
  const firstRun = [it('1'), it('2')];
  const today = { date: '2026-11-20', sources: [{ feedId: 'a', items: selectNew('a', firstRun, new Set()) }] };
  const second = selectNew('a', [it('1'), it('2'), it('3')], buildSeen([today]));
  assert.deepEqual(second.map((x) => x.id), ['3']);
});

test('同じ取得結果の中の重複は1件にする', () => {
  assert.equal(selectNew('a', [it('1'), it('1')], new Set()).length, 1);
});

test('guid が無い記事は正規化したリンクで判定する', () => {
  const a = normalizeItem({ title: 'x', link: 'https://example.com/n/1?utm_source=rss' }, 'now');
  const b = normalizeItem({ title: 'x', link: 'https://example.com/n/1#comments' }, 'now');
  const seen = buildSeen([{ sources: [{ feedId: 'f', items: [a] }] }]);
  assert.equal(selectNew('f', [b], seen).length, 0);
});
