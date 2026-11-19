// フィードの取得と整形。ネットワークを使うのは fetchFeed / fetchAll だけ。

import Parser from 'rss-parser';
import { isSafeUrl, normalizeLink, makeExcerpt, toJstIso } from './util.js';

export const USER_AGENT = 'newsdeck (personal RSS reader)';
export const TIMEOUT_MS = 10_000;

const parser = new Parser({
  customFields: {
    item: [['dc:date', 'dcDate'], ['dc:subject', 'dcSubject'], ['category', 'rawCategories', { keepArray: true }]],
  },
});

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value._ === 'string') return value._;
  return String(value);
}

function categoriesOf(item) {
  const list = [...(item.categories ?? []), ...(item.rawCategories ?? []), item.dcSubject];
  // Atom は <category term="…"/>、RSS は <category>…</category>
  return [...new Set(list.map((c) => text(c?.$?.term ?? c).trim()).filter(Boolean))];
}

/** rss-parser の1項目を newsdeck の形に整える。リンクが http/https でなければ null。 */
export function normalizeItem(item, fetchedAt) {
  const link = normalizeLink(text(item.link));
  if (!isSafeUrl(link)) return null;
  const guid = text(item.guid ?? item.id).trim();
  return {
    id: guid || link,
    title: text(item.title).replace(/\s+/g, ' ').trim(),
    link,
    excerpt: makeExcerpt(item.content || item.summary || item.contentSnippet || item.description || ''),
    publishedAt: toJstIso(item.isoDate || item.pubDate || item.dcDate),
    fetchedAt,
    summary: null,
    categories: categoriesOf(item),
  };
}

/** XML 文字列を解釈して取得結果にする。解釈できなければ status: error。 */
export async function parseFeedXml(feedId, xml, fetchedAt) {
  let parsed;
  try {
    parsed = await parser.parseString(xml);
  } catch {
    return { feedId, status: 'error', error: 'parse error', items: [] };
  }
  const items = (parsed.items ?? []).map((item) => normalizeItem(item, fetchedAt)).filter(Boolean);
  return { feedId, status: 'ok', error: null, items };
}

/** XML 宣言の encoding を見て文字コードを決める（既定は UTF-8）。 */
export function decodeBody(buffer) {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 200));
  const declared = /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  try {
    return new TextDecoder(declared || 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/** 1つのフィードを取得する。失敗しても例外は投げず、status: error を返す。 */
export async function fetchFeed(feed, { fetchedAt, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  let body;
  try {
    const res = await fetchImpl(feed.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { feedId: feed.id, status: 'error', error: `http ${res.status}`, items: [] };
    body = decodeBody(new Uint8Array(await res.arrayBuffer()));
  } catch (e) {
    const reason = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network error';
    return { feedId: feed.id, status: 'error', error: reason, items: [] };
  }
  return parseFeedXml(feed.id, body, fetchedAt);
}

/** すべてのフィードを並列に取得する。 */
export function fetchAll(feeds, options) {
  return Promise.all(feeds.map((feed) => fetchFeed(feed, options)));
}
