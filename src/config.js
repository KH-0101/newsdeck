// feeds.json の形式を確かめる（純粋関数）。誤りがあれば、何が悪いかを並べて例外を投げる。

import { isSafeUrl } from './util.js';

export const CATEGORIES = ['一般', '国際', '技術', 'セキュリティ'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ConfigError extends Error {
  constructor(problems) {
    super(`feeds.json に誤りがあります:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '');
}

/** 設定を検証し、既定値を補った設定を返す。 */
export function validateConfig(config) {
  const problems = [];
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new ConfigError(['最上位がオブジェクトではありません']);
  }
  const excludeKeywords = config.excludeKeywords ?? [];
  if (!isStringArray(excludeKeywords)) problems.push('excludeKeywords は空でない文字列の配列にしてください');
  if (!Array.isArray(config.feeds) || config.feeds.length === 0) {
    problems.push('feeds に情報源を1件以上入れてください');
    throw new ConfigError(problems);
  }

  const seen = new Set();
  const feeds = config.feeds.map((feed, i) => {
    const label = `feeds[${i}]${feed && typeof feed.id === 'string' ? `（${feed.id}）` : ''}`;
    if (feed === null || typeof feed !== 'object') {
      problems.push(`${label}: オブジェクトではありません`);
      return feed;
    }
    for (const key of ['id', 'name', 'url', 'category']) {
      if (typeof feed[key] !== 'string' || feed[key].trim() === '') problems.push(`${label}: ${key} がありません`);
    }
    if (typeof feed.id === 'string' && feed.id !== '') {
      if (!ID_PATTERN.test(feed.id)) problems.push(`${label}: id は英小文字・数字・ハイフンにしてください`);
      if (seen.has(feed.id)) problems.push(`${label}: id「${feed.id}」が重複しています`);
      seen.add(feed.id);
    }
    if (typeof feed.url === 'string' && feed.url !== '' && !isSafeUrl(feed.url)) {
      problems.push(`${label}: url は http: か https: にしてください`);
    }
    if (typeof feed.category === 'string' && feed.category !== '' && !CATEGORIES.includes(feed.category)) {
      problems.push(`${label}: category は ${CATEGORIES.join('、')} のいずれかにしてください`);
    }
    if (feed.trial !== undefined && typeof feed.trial !== 'boolean') problems.push(`${label}: trial は true か false にしてください`);
    if (feed.addedAt !== undefined && !(typeof feed.addedAt === 'string' && DATE_PATTERN.test(feed.addedAt))) {
      problems.push(`${label}: addedAt は YYYY-MM-DD にしてください`);
    }
    if (feed.maxItems !== undefined && !(Number.isInteger(feed.maxItems) && feed.maxItems >= 1)) {
      problems.push(`${label}: maxItems は1以上の整数にしてください`);
    }
    if (feed.excludeKeywords !== undefined && !isStringArray(feed.excludeKeywords)) {
      problems.push(`${label}: excludeKeywords は空でない文字列の配列にしてください`);
    }
    return {
      lang: 'ja',
      trial: false,
      addedAt: null,
      ...feed,
      excludeKeywords: feed.excludeKeywords ?? [],
    };
  });

  if (problems.length > 0) throw new ConfigError(problems);
  return { excludeKeywords, feeds };
}
