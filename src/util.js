// エスケープ、URL検証、抜粋づくり、JST の日付など。すべて純粋関数。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** HTML に埋め込む文字列をエスケープする。null/undefined は空文字にする。 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** http: と https: の URL だけを true にする。 */
export function isSafeUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** リンクを正規化する: 前後の空白を除き、# 以降と utm_* のクエリを取り除く。 */
export function normalizeLink(value) {
  const trimmed = String(value ?? '').trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed.split('#')[0];
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  return url.toString();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/** 文字（書記素）単位で max 字に切り詰める。切ったときは末尾を「…」にして max 字に収める。 */
export function truncate(text, max) {
  const chars = Array.from(segmenter.segment(text), (s) => s.segment);
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join('') + '…';
}

/** HTML を含みうる本文から抜粋を作る: タグ除去、実体参照の復元、空白の圧縮、最大 max 字。 */
export function makeExcerpt(html, max = 120) {
  if (!html) return '';
  const text = decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      // 段落や改行のタグは空白に、<b> などのインラインのタグは消す
      .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|td|th|blockquote|section|article)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(text, max);
}

function toJstParts(date) {
  const d = new Date(new Date(date).getTime() + JST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    y: d.getUTCFullYear(),
    mo: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    h: pad(d.getUTCHours()),
    mi: pad(d.getUTCMinutes()),
    s: pad(d.getUTCSeconds()),
    wd: d.getUTCDay(),
  };
}

/** 日時を JST の ISO 8601（+09:00 付き）にする。解釈できなければ null。 */
export function toJstIso(value) {
  if (value == null || value === '') return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const p = toJstParts(time);
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}:${p.s}+09:00`;
}

/** 日時の JST での日付 YYYY-MM-DD。 */
export function jstDate(value) {
  const p = toJstParts(value);
  return `${p.y}-${p.mo}-${p.d}`;
}

/** 日時の JST での時刻 HH:MM。 */
export function jstTime(value) {
  const p = toJstParts(value);
  return `${p.h}:${p.mi}`;
}

/** YYYY-MM-DD に n 日を足す。 */
export function addDays(dateStr, n) {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + n * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** YYYY-MM-DD の曜日（日〜土）。 */
export function weekday(dateStr) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

/** 記事の時刻表示。ページの日付と同じ日なら HH:MM、違う日なら MM/DD HH:MM（D-24）。無ければ空文字。 */
export function formatItemTime(iso, pageDate) {
  if (!iso) return '';
  const date = jstDate(iso);
  if (date !== pageDate) return `${date.slice(5, 7)}/${date.slice(8, 10)} ${jstTime(iso)}`;
  return jstTime(iso);
}
