# 公開状況

2026-10-07：GitHub Pagesへの公開成功。

- アプリ： https://progryobe.github.io/x3-batch/
- リポジトリ： https://github.com/progryobe/x3-batch
- 公開したコード： `8df39b26d18a431aae342f999f19d549b0c339e8`
- 成功したActions： https://github.com/progryobe/x3-batch/actions/runs/37627705348

Python 7件、Web 11件、Chromium 153でのブラウザ4件（500枚含む）、静的build、Pages deployがすべて成功。公開URLでアプリの表示も確認した。

公開URL上での追加の手動ファイル入力は、遠隔ブラウザ操作環境のタイムアウトで完了できなかった。同じproductionビルドのサブパス配信で、入力からXTCHダウンロードまでのブラウザ自動試験は成功している。X3実機は未検証。

mainへの更新で `.github/workflows/pages.yml` がテスト・build・Pagesデプロイを行う。Pages SourceはGitHub Actions。公開状態とURLの正本はActionsのdeployment出力とSettings → Pages。
