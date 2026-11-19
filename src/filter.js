// PR・広告記事の除外（純粋関数）。SPEC 3.3。

const ASCII_WORD = /^[A-Za-z]+$/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * キーワードの判定関数を作る。
 * 英字だけのキーワード（PR、AD、Sponsored）は大文字・小文字を区別せず、単語として一致したときだけ true。
 * それ以外（日本語や記号を含むもの）は部分一致。
 */
export function keywordMatcher(keyword) {
  if (ASCII_WORD.test(keyword)) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(keyword)}(?![A-Za-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  const lower = keyword.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}

/** タイトルとカテゴリから、最初に一致したキーワードを返す。無ければ null。 */
export function findMatch(item, matchers) {
  const targets = [item.title ?? '', ...(item.categories ?? [])];
  for (const { keyword, test } of matchers) {
    if (targets.some((t) => test(t))) return keyword;
  }
  return null;
}

/**
 * 記事を残すものと除外するものに分ける。
 * 残す記事からは判定にだけ使う categories を取り除く（保存しない）。
 */
export function filterItems(items, keywords) {
  const matchers = [...new Set(keywords)].map((keyword) => ({ keyword, test: keywordMatcher(keyword) }));
  const kept = [];
  const excluded = [];
  for (const item of items) {
    const matched = findMatch(item, matchers);
    if (matched) {
      excluded.push({ id: item.id, title: item.title, link: item.link, matched });
    } else {
      const { categories, ...rest } = item;
      kept.push(rest);
    }
  }
  return { items: kept, excluded };
}
