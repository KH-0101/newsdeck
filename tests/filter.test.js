import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterItems, keywordMatcher } from '../src/filter.js';

const { excludeKeywords } = JSON.parse(readFileSync(new URL('../feeds.json', import.meta.url), 'utf8'));
const item = (title, categories = []) => ({ id: title, title, link: 'https://example.com/' + encodeURIComponent(title), categories });
const isExcluded = (title, categories, keywords = excludeKeywords) =>
  filterItems([item(title, categories)], keywords).excluded.length === 1;

test('PR 記事を除外する', () => {
  assert.equal(isExcluded('【PR】新製品'), true);
  assert.equal(isExcluded('[PR] 新サービスのご案内'), true);
  assert.equal(isExcluded('Sponsored: Best laptops of 2026'), true);
  assert.equal(isExcluded('sponsored post'), true, '大文字・小文字を区別しない');
  assert.equal(isExcluded('【広告】秋の特集'), true);
  assert.equal(isExcluded('おすすめの家電（提供：〇〇株式会社）'), true);
  assert.equal(isExcluded('普通のタイトル', ['PR']), true, 'カテゴリも見る');
  assert.equal(isExcluded('Big sale', ['AD']), true);
});

test('英字のキーワードは単語として一致したときだけ除外する', () => {
  assert.equal(isExcluded('ADHDの研究が進む'), false);
  assert.equal(isExcluded('PRESS RELEASE: new version'), false);
  assert.equal(isExcluded('Apple PR team says'), true);
});

test('普通のニュースに出てくる「提供」「広告」では除外しない（D-23）', () => {
  assert.equal(isExcluded('新サービス「Microsoft Perception」提供開始'), false);
  assert.equal(isExcluded('地域ブランドと偽り提供か 店主ら逮捕'), false);
  assert.equal(isExcluded('集客や広告宣伝支援「KARTE」に不正アクセス'), false);
  assert.equal(isExcluded('五輪スポンサー企業が撤退'), false);
});

test('情報源ごとのキーワードを合わせて使える', () => {
  assert.equal(isExcluded('今週のセール情報', [], [...excludeKeywords, 'セール']), true);
});

test('除外したものは matched つきで返し、残すものからは categories を除く', () => {
  const out = filterItems([item('【PR】A'), item('B', ['政治'])], excludeKeywords);
  assert.deepEqual(out.excluded, [{ id: '【PR】A', title: '【PR】A', link: item('【PR】A').link, matched: 'PR' }]);
  assert.equal(out.items.length, 1);
  assert.equal('categories' in out.items[0], false);
});

test('keywordMatcher: 日本語は部分一致', () => {
  assert.equal(keywordMatcher('タイアップ')('映画とのタイアップ企画'), true);
});
