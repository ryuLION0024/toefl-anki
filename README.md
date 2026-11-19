# TOEFL暗記

AWL 570語を TOEFL Reading「Complete the Words」形式で覚えるオフライン対応の暗記アプリ（PWA）。

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

## 端末間の進捗移行

進捗は端末ごとに保存される。「記録・設定」→「進捗をコピー」→ もう一方の端末の「読み込む」に貼り付け。

## 更新の反映

`main` に push すると数分で公開URLに反映される。アプリはネットワーク優先なので、オンラインで開けば最新版になる。
