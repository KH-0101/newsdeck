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
