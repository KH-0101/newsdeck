import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, ConfigError } from '../src/config.js';

const feed = (over = {}) => ({ id: 'a', name: 'A', url: 'https://example.com/rss', category: '一般', ...over });

test('リポジトリの feeds.json は正しい', () => {
  const config = JSON.parse(readFileSync(new URL('../feeds.json', import.meta.url), 'utf8'));
  const out = validateConfig(config);
  assert.equal(out.feeds.length, 4);
});

test('既定値を補う', () => {
  const out = validateConfig({ feeds: [feed()] });
  assert.deepEqual(out.excludeKeywords, []);
  assert.equal(out.feeds[0].trial, false);
  assert.deepEqual(out.feeds[0].excludeKeywords, []);
});

function problemsOf(config) {
  try {
    validateConfig(config);
  } catch (e) {
    assert.ok(e instanceof ConfigError);
    return e.problems.join('\n');
  }
  assert.fail('エラーになるはず');
}

test('id の重複を検出する', () => {
  assert.match(problemsOf({ feeds: [feed(), feed()] }), /id「a」が重複/);
});

test('http/https でない URL を検出する', () => {
  assert.match(problemsOf({ feeds: [feed({ url: 'javascript:alert(1)' })] }), /url は http: か https:/);
  assert.match(problemsOf({ feeds: [feed({ url: 'ftp://example.com/rss' })] }), /url は http: か https:/);
});

test('必須項目の欠けを検出する', () => {
  const msg = problemsOf({ feeds: [{ id: 'x', url: 'https://example.com' }] });
  assert.match(msg, /name がありません/);
  assert.match(msg, /category がありません/);
});

test('id の形式、カテゴリ、feeds が空のときを検出する', () => {
  assert.match(problemsOf({ feeds: [feed({ id: 'NHK_main' })] }), /英小文字・数字・ハイフン/);
  assert.match(problemsOf({ feeds: [feed({ category: 'スポーツ' })] }), /category は/);
  assert.match(problemsOf({ feeds: [] }), /1件以上/);
});

test('maxItems は1以上の整数', () => {
  assert.equal(validateConfig({ feeds: [feed({ maxItems: 5 })] }).feeds[0].maxItems, 5);
  assert.match(problemsOf({ feeds: [feed({ maxItems: 0 })] }), /maxItems は1以上の整数/);
  assert.match(problemsOf({ feeds: [feed({ maxItems: '5' })] }), /maxItems は1以上の整数/);
});
