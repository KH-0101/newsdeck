// 新着判定（純粋関数）。SPEC 4。同じ feedId と id の組が過去に出ていれば既出とみなす。

const keyOf = (feedId, id) => `${feedId}\u0000${id}`;

/** 過去のデータ（data/*.json の中身の配列）から、既出の組の集合を作る。PR除外したものも含める。 */
export function buildSeen(days) {
  const seen = new Set();
  for (const day of days) {
    for (const source of day.sources ?? []) {
      for (const item of [...(source.items ?? []), ...(source.excluded ?? [])]) {
        seen.add(keyOf(source.feedId, item.id));
      }
    }
  }
  return seen;
}

/** 過去のデータに出た記事のリンクの集合（情報源をまたいだ重複を除くため。D-27）。 */
export function buildSeenLinks(days) {
  const links = new Set();
  for (const day of days) {
    for (const source of day.sources ?? []) {
      for (const item of source.items ?? []) links.add(item.link);
    }
  }
  return links;
}

/**
 * 情報源をまたいで、同じリンクの記事を最初の情報源にだけ残す（D-27）。
 * sources は feeds.json の順に並んでいるものとする。seenLinks は変更しない。
 */
export function dropCrossFeedDuplicates(sources, seenLinks) {
  const links = new Set(seenLinks);
  return sources.map((s) => {
    const items = s.items.filter((item) => !links.has(item.link));
    for (const item of items) links.add(item.link);
    return { ...s, items };
  });
}

/** まだ出ていない記事だけを返す。同じ取得結果の中での重複も1件にする。seen は変更しない。 */
export function selectNew(feedId, items, seen) {
  const local = new Set();
  return items.filter((item) => {
    const key = keyOf(feedId, item.id);
    if (seen.has(key) || local.has(key)) return false;
    local.add(key);
    return true;
  });
}
