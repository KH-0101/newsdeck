# newsdeck — CLAUDE.md

あちこちのニュースサイトやブログの RSS を毎朝自動で集め、日付ごとの1ページにまとめて GitHub Pages で読む、個人用のニュース集約ツール。

## 最初に読むもの
- **SPEC.md** … 仕様。ここに書いてあることが正しい。決定ログは D-番号。
- **TASKS.md** … 実装計画とチェックリスト。

## 絶対に守ること（D-5, D-6）
- **APIキー・トークンをリポジトリに入れない。** このリポジトリは公開（public）なので、一度コミットした値は漏れたものとして扱う。
  - キーは GitHub の Actions Secrets にだけ置く。ローカル用は `.env`（Git 管理外）に置き、`.env.example` には値を書かない。
  - キーを使う処理は、ビルド時（Node.js）だけで行う。**ブラウザで動く JavaScript や生成した HTML にキーを含めない。** ブラウザから外部 API を直接呼ばない。
  - ワークフローで Secrets を `echo` したりログに出したりしない。`pull_request_target` は使わない。
  - コミットの前に、差分にキーらしい文字列（`sk-`、`ghp_`、`api_key=` など）が無いかを確かめる。
- **AI要約は、ユーザーが「作る」と言うまで実装しない。** APIキーを作ることも、要求することもしない。データの `summary` は `null` のままにする。
- **記事の本文を転載しない。** 載せるのは、タイトル、リンク、抜粋（最大120字）、取得元だけにする（D-4）。

## 技術上の制約
- Node.js（ESモジュール）で作る。実行時の依存は `rss-parser` だけにする。依存を増やすときは SPEC.md の決定ログに追記してから入れる。
- 生成物は素の HTML/CSS にする。ブラウザ側の JavaScript は使わないか、最小限にとどめる（フレームワークは使わない）。
- 処理は「取得 → 除外 → 新着判定 → 保存 → HTML生成」に分ける。`src/` の各モジュールは、ネットワークとファイルの入出力を `fetch.js`、`store.js`、`build.js` に閉じ込める。除外、新着判定、HTML生成は純粋関数にしてテストする。
- テストは `node --test`。ネットワークを使わず、`tests/fixtures/` の RSS/Atom ファイルで確かめる。
- 外部から来る文字列（タイトル、抜粋、URL）は信用しない。HTML はすべてエスケープし、リンクは `http:` と `https:` だけを許可する。
- 生成した HTML には `<meta name="robots" content="noindex, nofollow">` を必ず付ける。
- スマホ（幅375px）とPCで崩れないようにし、ダークモードに対応する。
- 日付は日本時間（JST）で扱う。GitHub Actions は UTC で動くので注意する。

## ディレクトリ構成（予定）
```
newsdeck/
  feeds.json          登録している情報源と除外キーワード（手で編集する）
  package.json
  src/
    build.js          入口。全体の流れを組み立てる
    fetch.js          フィードの取得（タイムアウト、失敗の記録）
    filter.js         PR・広告記事の除外（純粋関数）
    dedupe.js         新着判定（純粋関数）
    store.js          data/*.json の読み書き、30日を過ぎたものの削除
    render.js         HTML生成（純粋関数）
    util.js           エスケープ、URL検証、抜粋づくり、JSTの日付
  tests/              *.test.js と fixtures/
  data/               日付ごとの取得結果（Actions がコミットする）
  public/             生成した HTML（Git 管理外。Actions が Pages に配置する）
  .github/workflows/daily.yml
  README.md
```

## 作業ルール
- 仕様にない判断が必要になったら、勝手に決めずに SPEC.md の決定ログに D-番号を付けて追記する。重要なものはユーザーに確認する。
- ユーザーへのヒアリングは、判断が分かれる点だけにする。明らかな点は Claude が決め、「Claude判断」と明記する。
- 情報源の追加と削除は、ユーザーが決める。Claude は候補と理由を出すだけにする（D-10）。
- タスクが終わったら TASKS.md のチェックを更新する。基本は1タスク1コミットにする。
- UI の文言、ドキュメント、コミットメッセージは日本語にする。
- git は Git Bash から使う（PowerShell の PATH には入っていない）。
- GitHub の設定（リポジトリ作成、Pages、Secret scanning など）はユーザーが画面で行う。Claude は手順を示す。
