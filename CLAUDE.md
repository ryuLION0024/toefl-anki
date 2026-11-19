# CLAUDE.md — TOEFL暗記

## 概要
TST Prep の TOEFL 素材（`~/Desktop/12.英語勉強/TSTprep`）を完全暗記するための個人用学習アプリ。AWL 570語を TOEFL Reading「Complete the Words」形式の穴埋めで覚え、間違えたら語源ヒントと間隔反復（SRS）で復習する。Mac と iPhone でオフライン利用する PWA。「書く・話す」タブ（`practice.js`）でテンプレート暗記・Build a Sentence・Listen and Repeat・Take an Interview も練習できる。

## 技術スタック
ビルド不要の静的 PWA（HTML / CSS / 素の JavaScript）。データは `data/*.json`、進捗は localStorage。Service Worker（`sw.js`）でオフラインキャッシュ。データ抽出用に Python（pypdf）。

## 実行方法
```bash
node tools/serve.mjs
```
ブラウザで http://localhost:8640 を開く。iPhone で使うには HTTPS で配信して Safari の「ホーム画面に追加」が必要（Service Worker は HTTPS か localhost でしか動かない）。

## テスト
未整備。`node tools/check_data.mjs` でデータ整合性（空欄対象語が段落内に存在するか等）をチェックする。

## 制約・注意点
- 素材 PDF は TST Prep の著作物。PDF の文章や PDF から抽出したデータ（tools/awl_raw.json、gitignore 済み）をリポジトリに入れない。段落・訳・例文は自作する。リポジトリは GitHub Pages 配信のため公開。
- `data/practice/*.json` は自作のオリジナル問題のみ。TST Prep 原文は `tools/build_private_pack.py` で `private/tstprep-pack.json`（gitignore 済み）に抽出し、アプリの設定画面から端末の localStorage（キー `toefl-anki-pack`）に取り込む方式。原文を data/ に入れない。
- データやアセットを変更したら `sw.js` の `CACHE_VERSION` を上げる（上げないと iPhone 側が古いキャッシュのまま）。
- 進捗は端末ごとの localStorage。Mac と iPhone の同期は「設定」画面の書き出し / 読み込み（JSON）で手動。
