# TOEFL暗記

AWL 全564語（212段落）を TOEFL Reading「Complete the Words」形式で覚えるオフライン対応の暗記アプリ（PWA）。

公開URL: https://ryulion0024.github.io/toefl-anki/

## iPhone に入れる

1. Safari で公開URLを開く（Chrome などでは不可）
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンから起動する。一度開けば以後はオフラインで使える

## Mac で使う

公開URLを Safari / Chrome で開けばよい（Chrome はアドレスバーの「インストール」でアプリ化できる）。開発時はローカルで起動:

```bash
node tools/serve.mjs
```

http://localhost:8640 を開く。

## 書く・話す（Writing / Speaking）

テンプレート・模範解答の段階的暗記、Build a Sentence、Listen and Repeat（録音・書き取り）、Take an Interview（45秒・録音）。公開版の問題と模範解答はすべてオリジナル。

TST Prep の PDF の原文（テンプレート・模範解答・例題・チェックリスト・Essential Prefixes の一覧）を使うには、Mac で個人用データを作る:

```bash
python3 tools/build_private_pack.py ~/Desktop/12.英語勉強/TSTprep
```

できた `private/tstprep-pack.json`（git 管理外）を、各端末の「記録・設定 → TST Prep 個人用データ → ファイルを選ぶ」で読み込む。iPhone へは AirDrop で送り「ファイル」アプリに保存してから選ぶ。データは端末内にだけ保存され、ネットには出ない。

## 接頭辞ガイド

「単語一覧」タブの「接頭辞」で、意味別に分けた60の接頭辞を日本語の解説付きで見られる（`data/prefixes.json`、オリジナル）。例語のうち AWL 単語はタップで単語カードが開く。個人用データを読み込むと TST の54接頭辞の一覧にも切り替えられる。

## 端末間の進捗移行

進捗は端末ごとに保存される。「記録・設定」→「進捗をコピー」→ もう一方の端末の「読み込む」に貼り付け。

## 更新の反映

`main` に push すると数分で公開URLに反映される。アプリはネットワーク優先なので、オンラインで開けば最新版になる。
