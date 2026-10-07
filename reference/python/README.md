# X3 Batch 0.1.0

JPEG / PNGをまとめて、XTEINK X3用の1冊のXTCHへ変換するローカルデスクトップアプリです。

**実装・Linux上での動作検証済みのソース版です。macOS用の署名済みアプリは同梱していません。Mac実機での起動とX3純正ファームでの表示は未検証です。**

## Macで起動

対象はApple Silicon、macOS 13以降、arm64版Python 3.11〜3.13（3.12推奨）。Python未導入の場合は python.org のmacOS universal2インストーラなどで導入してください。初回の依存ライブラリ取得にはインターネット接続が必要です。

ZIPを展開し、ターミナルでこのフォルダに移動して実行します。

```bash
bash Start.command
```

初回は専用の `.venv` を作成して依存ライブラリをインストールします。2回目以降は次のコマンドでオフライン起動できます。

```bash
.venv/bin/python run.py
```

手動セットアップの場合：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py
```

## 使い方

1. 「フォルダを追加」または画像・フォルダのドラッグ＆ドロップで読み込みます。サブフォルダも対象です。
2. 左の一覧は入力グループ・相対パスの自然順です。`1.jpg → 2.jpg → 10.jpg` になります。後から追加したグループは末尾に入ります。ドラッグで並べ替えられます。
3. 選択ページを見ながら Fit / Fill、明るさ、コントラスト、ディザを調整します。原画像にも切り替えられます。
4. 「Export XTCH」で保存先を選ぶと全ページを1冊へ変換します。設定は全ページ共通です。

- 出力：528 × 792、4階調（0 / 85 / 170 / 255）、1ページ約102 KiB。500ページは約49.9 MiBです。
- Fitは白余白つきの全体表示、Fillは中央クロップです。切り抜き位置の個別調整は未実装です。
- Floyd-Steinberg：写真・漫画向け。None：網点なし。Bayer：規則的な網点。
- 透過PNGは白背景に合成し、EXIFの回転を反映します。
- 読み込み不可のページは書き出しを停止してファイル名を通知します。黙って除外しません。
- 中止・失敗時は一時ファイルを削除します。既存ファイルは全処理成功後だけ置き換えます。
- 元画像を変更せず、ネットワーク送信もしません。

## .appをビルド

Apple SiliconのMacで、上記セットアップ後に実行します。

```bash
bash scripts/build-macos.sh
open 'dist/X3 Batch.app'
```

PyInstallerのonedir構成です。Qtを動的ライブラリとして同梱し、ランタイムの差し替えが可能な構成を維持します。`dist/X3 Batch.app` 全体を移動してください。Apple Developer ID署名・公証は実装していません。外部配布する際は署名・公証と同梱ライセンスの確認が別途必要です。ビルドスクリプト自体はこのLinux環境では実行検証できていません。

## テスト

```bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/ui_smoke.py
.venv/bin/python scripts/benchmark.py
```

`ui_smoke.py` はオフスクリーンで500画像を読み込み、プレビュー・設定変更・実際のGUIエクスポート処理を検証します。Linuxでは日本語フォントが別途必要です。

参考リポジトリを別途cloneした場合、XTH出力の比較もできます。

```bash
# reference-root/refiner と reference-root/xteink-x4-helpers があること
.venv/bin/python scripts/verify_references.py /path/to/reference-root
```

検証結果は `docs/VALIDATION.md`、構成・参考OSS・拡張点は `docs/DEVELOPMENT.md` にあります。

## 今回の範囲

画像複数入力、フォルダ入力、ドロップ、サムネイル遅延生成、自然順、ドラッグ並べ替え、選択ページの非同期プレビュー、画像調整、逐次XTCH出力、進捗、中止を実装しています。

ZIP/CBZ、Save per Folder、PDF/EPUB、Wi-Fi転送、設定保存、X4のUIプリセットは未実装です。フォルダ単位出力に備えて各ページに元グループを保持しています。
