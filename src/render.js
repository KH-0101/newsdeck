// HTML生成（純粋関数）。SPEC 6。外から来た文字列はすべて escapeHtml を通す。

import { CATEGORIES } from './config.js';
import { escapeHtml as h, isSafeUrl, weekday, jstTime, formatItemTime, addDays } from './util.js';

export const FOLD_AFTER = 20;
const TRIAL_WINDOW_DAYS = 14;
const CATEGORY_IDS = { 一般: 'general', 国際: 'world', 技術: 'tech', セキュリティ: 'security' };
const UNREGISTERED = '登録解除';

function page({ title, body }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${h(title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${body}
</body>
</html>
`;
}

const dateLabel = (date) => `${date} (${weekday(date)})`;
const countItems = (day) => (day.sources ?? []).reduce((n, s) => n + s.items.length, 0);
const countErrors = (day) => (day.sources ?? []).filter((s) => s.status === 'error').length;

/** 新しい順。公開日時が無いものは末尾（元の順を保つ）。 */
export function sortItems(items) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const pa = a.item.publishedAt ? Date.parse(a.item.publishedAt) : null;
      const pb = b.item.publishedAt ? Date.parse(b.item.publishedAt) : null;
      if (pa === null && pb === null) return a.i - b.i;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pb - pa || a.i - b.i;
    })
    .map(({ item }) => item);
}

/** お試しの情報源について、直近14日の1日あたり平均件数と PR除外件数を数える。 */
export function trialStats(feed, days, date) {
  const from = addDays(date, -(TRIAL_WINDOW_DAYS - 1));
  const window = days.filter((d) => d.date >= from && d.date <= date && (!feed.addedAt || d.date >= feed.addedAt));
  let items = 0;
  let excluded = 0;
  for (const d of window) {
    const s = d.sources?.find((x) => x.feedId === feed.id);
    if (!s) continue;
    items += s.items.length;
    excluded += s.excluded?.length ?? 0;
  }
  return { days: window.length, average: window.length ? items / window.length : 0, excluded };
}

function link(url, text, cls = '') {
  const c = cls ? ` class="${cls}"` : '';
  if (!isSafeUrl(url)) return `<span${c}>${h(text)}</span>`;
  return `<a${c} href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(text)}</a>`;
}

function renderItem(item, date) {
  const time = formatItemTime(item.publishedAt, date);
  const timeHtml = time ? `<time datetime="${h(item.publishedAt)}">${h(time)}</time>` : '';
  const excerpt = item.excerpt ? `<p class="excerpt">${h(item.excerpt)}</p>` : '';
  return `<li class="item"><div class="item-head">${link(item.link, item.title || item.link, 'item-title')}${timeHtml}</div>${excerpt}</li>`;
}

function renderSource({ feed, source, days, date }) {
  const name = feed ? feed.name : `${source.feedId}（${UNREGISTERED}）`;
  const items = sortItems(source.items);
  const parts = [];
  const meta = [];
  if (feed?.trial) {
    const st = trialStats(feed, days, date);
    meta.push(`<span class="badge">お試し</span>`);
    meta.push(`<span class="trial">平均${st.average.toFixed(1)}件/日・PR除外${st.excluded}件（${st.days}日）</span>`);
  }
  const count = `<span class="count">${items.length}</span>`;
  parts.push(`<h3 class="source-name"><span>${h(name)}</span>${count}${meta.join('')}</h3>`);

  if (source.status === 'error') {
    parts.push(`<p class="status status-error" role="status">⚠ 取得失敗（${h(source.error || '理由不明')}）</p>`);
  } else if (items.length === 0) {
    parts.push(`<p class="status status-empty">新着なし</p>`);
  }
  if (items.length > 0) {
    const head = items.slice(0, FOLD_AFTER);
    const rest = items.slice(FOLD_AFTER);
    parts.push(`<ol class="items">${head.map((i) => renderItem(i, date)).join('')}</ol>`);
    if (rest.length > 0) {
      parts.push(
        `<details class="more"><summary>ほか ${rest.length}件</summary><ol class="items">${rest.map((i) => renderItem(i, date)).join('')}</ol></details>`,
      );
    }
  }
  const excluded = source.excluded ?? [];
  if (excluded.length > 0) {
    const list = excluded
      .map((e) => `<li><span class="matched">${h(e.matched)}</span>${link(e.link, e.title || e.link)}</li>`)
      .join('');
    parts.push(`<details class="excluded"><summary>PR除外 ${excluded.length}件</summary><ul>${list}</ul></details>`);
  }
  const lang = feed?.lang && feed.lang !== 'ja' ? ` lang="${h(feed.lang)}"` : '';
  const state = source.status === 'error' ? ' is-error' : items.length === 0 ? ' is-empty' : '';
  return `<section class="source${state}"${lang}>${parts.join('')}</section>`;
}

/** その日のデータを、カテゴリ → 情報源の順に並べる。feeds.json に無い情報源は末尾にまとめる。 */
export function groupSources(day, feeds) {
  const byId = new Map((day.sources ?? []).map((s) => [s.feedId, s]));
  const groups = CATEGORIES.map((category) => ({
    category,
    entries: feeds.filter((f) => f.category === category && byId.has(f.id)).map((f) => ({ feed: f, source: byId.get(f.id) })),
  }));
  const known = new Set(feeds.map((f) => f.id));
  const orphans = (day.sources ?? []).filter((s) => !known.has(s.feedId)).map((s) => ({ feed: null, source: s }));
  if (orphans.length) groups.push({ category: UNREGISTERED, entries: orphans });
  return groups.filter((g) => g.entries.length > 0);
}

function navLink(href, text, rel) {
  return href ? `<a href="${h(href)}" rel="${rel}">${text}</a>` : `<span class="disabled" aria-disabled="true">${text}</span>`;
}

/**
 * 日付ページ。
 * @param {object} p
 * @param {object} p.day   その日の data
 * @param {object[]} p.feeds  feeds.json の feeds
 * @param {object[]} p.days   保持している全日のデータ（お試しの平均に使う）
 * @param {string|null} p.prevDate  前のデータがある日
 * @param {string|null} p.nextDate  次のデータがある日
 */
export function renderDayPage({ day, feeds, days = [day], prevDate = null, nextDate = null }) {
  const groups = groupSources(day, feeds);
  const lastRun = day.runs?.length ? jstTime(day.runs[day.runs.length - 1]) : '—';
  const errors = countErrors(day);
  const catId = (c) => `cat-${CATEGORY_IDS[c] ?? 'other'}`;

  const toc = groups
    .map((g) => {
      const n = g.entries.reduce((sum, e) => sum + e.source.items.length, 0);
      return `<a href="#${catId(g.category)}">${h(g.category)}<span class="count">${n}</span></a>`;
    })
    .join('');

  const sections = groups
    .map(
      (g) =>
        `<section class="category" id="${catId(g.category)}"><h2>${h(g.category)}</h2>${g.entries
          .map((e) => renderSource({ ...e, days, date: day.date }))
          .join('')}</section>`,
    )
    .join('\n');

  const body = `<header class="masthead">
<div class="title-row"><a class="brand" href="index.html">newsdeck</a><h1 class="date">${h(dateLabel(day.date))}</h1></div>
<nav class="day-nav" aria-label="日付の移動">${navLink(prevDate && `${prevDate}.html`, '← 前日', 'prev')}<a href="archive.html">日付一覧</a>${navLink(nextDate && `${nextDate}.html`, '翌日 →', 'next')}</nav>
<p class="stats"><span>更新 ${h(lastRun)}</span><span>新着 <strong>${countItems(day)}</strong>件</span><span class="${errors ? 'has-error' : ''}">失敗 ${errors}件</span></p>
${toc ? `<nav class="toc" aria-label="カテゴリ">${toc}</nav>` : ''}
</header>
<main>
${sections || '<p class="status status-empty">データがありません</p>'}
</main>
<footer class="foot"><p>タイトルと抜粋は各情報源の RSS から。本文は元の記事でお読みください。</p></footer>`;

  return page({ title: `newsdeck ${day.date}`, body });
}

/** 日付の一覧（新しい順、新着件数つき）。 */
export function renderArchive({ days }) {
  const rows = [...days]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((d) => {
      const errors = countErrors(d);
      const err = errors ? `<span class="has-error">失敗 ${errors}件</span>` : '';
      return `<li><a href="${h(d.date)}.html">${h(dateLabel(d.date))}</a><span class="count">新着 ${countItems(d)}件</span>${err}</li>`;
    })
    .join('');
  const body = `<header class="masthead">
<div class="title-row"><a class="brand" href="index.html">newsdeck</a><h1 class="date">日付一覧</h1></div>
<nav class="day-nav" aria-label="ページの移動"><a href="index.html">今日のページへ</a></nav>
</header>
<main><ol class="archive">${rows || '<li>データがありません</li>'}</ol></main>`;
  return page({ title: 'newsdeck 日付一覧', body });
}

export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

export const CSS = `:root {
  --bg: #fbfaf7;
  --surface: #ffffff;
  --text: #1d1d1f;
  --muted: #5f6368;
  --line: #e4e1da;
  --accent: #1a5fb4;
  --visited: #6b4fa0;
  --badge-bg: #fff1c2;
  --badge-text: #6a4b00;
  --error-bg: #fdecea;
  --error-text: #a3261b;
  --empty: #7a7f85;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151618;
    --surface: #1d1f22;
    --text: #e8e6e3;
    --muted: #a3a7ad;
    --line: #2e3135;
    --accent: #8ab4f8;
    --visited: #c3a6f2;
    --badge-bg: #4a3b10;
    --badge-text: #ffe08a;
    --error-bg: #3d1c19;
    --error-text: #ffb4a8;
    --empty: #8d9197;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
a { color: var(--accent); }
.masthead, main, .foot { max-width: 46rem; margin: 0 auto; padding: 0 16px; }
.masthead { padding-top: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.brand { font-weight: 700; letter-spacing: .02em; text-decoration: none; color: var(--text); font-size: 1.05rem; }
.date { margin: 0; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.day-nav { display: flex; justify-content: space-between; gap: 8px; margin: 10px 0 4px; font-size: .95rem; }
.day-nav a, .day-nav span { padding: 6px 0; min-width: 4.5em; }
.day-nav a[rel="next"], .day-nav .disabled:last-child { text-align: right; }
.disabled { color: var(--muted); opacity: .5; }
.stats { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0; color: var(--muted); font-size: .9rem; }
.stats strong { color: var(--text); }
.has-error { color: var(--error-text); font-weight: 600; }
.toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; }
.toc a { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; color: var(--text); font-size: .9rem; background: var(--surface); }
.toc .count { color: var(--muted); font-variant-numeric: tabular-nums; }
.category { margin-top: 24px; scroll-margin-top: 8px; }
.category > h2 { margin: 0 0 8px; padding-bottom: 4px; font-size: 1.1rem; border-bottom: 2px solid var(--text); }
.source { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 12px 0; }
.source.is-empty { padding-top: 8px; padding-bottom: 8px; }
.source-name { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0; font-size: 1rem; }
.source-name .count { color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }
.source-name .count::before { content: "("; }
.source-name .count::after { content: ")"; }
.badge { font-size: .75rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--badge-bg); color: var(--badge-text); }
.trial { font-size: .8rem; font-weight: 400; color: var(--muted); }
.status { margin: 6px 0 0; font-size: .92rem; }
.status-empty { color: var(--empty); }
.status-error { color: var(--error-text); background: var(--error-bg); padding: 6px 10px; border-radius: 6px; font-weight: 600; }
.items { list-style: none; margin: 8px 0 0; padding: 0; }
.item { padding: 8px 0; border-top: 1px solid var(--line); }
.item:first-child { border-top: none; }
.item-head { display: flex; align-items: baseline; gap: 12px; }
.item-title { flex: 1; font-weight: 600; text-decoration: none; line-height: 1.5; }
a.item-title:visited { color: var(--visited); }
a.item-title:hover { text-decoration: underline; }
.item time { flex: none; color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
.excerpt { margin: 2px 0 0; color: var(--muted); font-size: .9rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
details { margin-top: 6px; }
summary { cursor: pointer; color: var(--muted); font-size: .9rem; padding: 4px 0; }
.more > .items { margin-top: 0; }
.excluded ul { margin: 4px 0 0; padding-left: 1.2em; font-size: .88rem; color: var(--muted); }
.excluded li { margin: 2px 0; }
.excluded a { color: var(--muted); }
.matched { display: inline-block; margin-right: 6px; padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font-size: .75rem; }
.archive { list-style: none; padding: 0; margin: 16px 0; }
.archive li { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 10px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.archive .count { color: var(--muted); }
.foot { margin-top: 32px; padding-bottom: 32px; color: var(--muted); font-size: .8rem; }
`;
