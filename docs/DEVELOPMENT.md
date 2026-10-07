# X3 Batch Web 継続開発メモ

## 目的

URLを開き、約500枚のJPEG / PNGをローカル処理で1冊のX3用XTCHにする。バックエンド・クラウド同期・本体転送は持たない。

## 既存実装の扱い

`reference/python/` は取得した `X3-Batch-MVP-0.1.0.zip` の内容を保持する。画像処理仕様・エンコードの基準として使い、Web版の都合で変更しない。

Pythonでの所在：`x3batch/core.py` の `process` / `encode_xth` / `export_xtch` / `natural_key`。GUI側の負荷制御は `x3batch/app.py`。既存7テストは `tests/test_core.py`。

WebはVite + React + TypeScript。画像処理と形式生成を独立した関数にし、Rust/WASMは導入しない。必要な処理量に対してTSで実装可能で、WASMの配布・デバッグを増やす根拠がない。

## 実装の所在

| ファイル | 内容 |
|---|---|
| `web/src/core/types.ts` | X3 preset、Page / Settings、Workerメッセージ |
| `web/src/core/files.ts` | File参照、自然順、再帰フォルダドロップ。readEntriesを空になるまで繰り返す |
| `web/src/core/images.ts` | 画像ヘッダーによるサイズ検査、EXIF対応デコード、Fit/Fill、サムネイル、Canvas変換 |
| `web/src/core/pixels.ts` | グレースケール、明るさ、平均値中心のコントラスト、4階調ディザ |
| `web/src/core/xtch.ts` | XTH packing / MD5、XTCHヘッダー・索引・メタデータ |
| `web/src/workers/image.worker.ts` | プレビュー・サムネイル・逐次バッチ変換 |
| `web/src/App.tsx` | 3ペイン、仮想化一覧、並べ替え、Workerライフサイクル、Blobダウンロード |
| `scripts/generate-fixtures.py` | 未変更Python版によるgoldenファイル生成 |
| `web/tests/` | 単体回帰、静的サブパス配信、実ブラウザ結合試験 |
| `.github/workflows/pages.yml` | main更新 → 回帰/ブラウザ試験 → build → Pages |

## 処理とメモリ

- 元画像はFile参照のみ。サムネイルは64×88、可視行+少数の前後行だけ逐次作成。
- ページ一覧DOMは仮想化（1行82px）。500枚のDOM画像を同時生成しない。
- プレビューは180ms debounce。前のWorkerをterminateして古い結果を破棄。
- サムネイルは専用Worker1つ。表示範囲変更で待機処理を取り消す。生成済みの小さいBlob URLだけキャッシュ。
- Exportは別Workerで1枚ずつデコード→処理→XTH→出力バッファへ格納。ImageBitmap.closeとCanvas縮小で解放。
- Export中は一覧変更・設定変更・サムネイル生成を停止。設定と順序を開始時に固定。
- キャンセルはWorkerをterminate。最後まで成功するまでダウンロードリンクを生成しない。
- 出力は1つのArrayBuffer（500ページ約50MiB）、完了時にメインへtransferしBlob化。出力バッファ/Blobには元画像と別にメモリが必要。2000ページを上限として極端な確保を防ぐ。
- 画像は50MP / 100MiBまで。JPEG SOFが先頭1MiB内にない場合はエラー。1画像のデコードはフルサイズになり得る。
- URL.revokeObjectURLをプレビュー更新、クリア、削除、出力置換、unmountで呼ぶ。

## 互換性の範囲

`xtch.ts` はPython版をポート。XTH：右→左の列・上→下、8ピクセルMSB-first、白パディング、MSB/LSBの2プレーン、白0/濃灰1/淡灰2/黒3。MD5はpayload digest先頭8 bytes。XTCH：version=1、56Bヘッダー、256Bメタ、16B/ページの索引。従来仕様のversion差異はPython版ドキュメントに記録済み。

XTH3種はPython版と完全一致。XTCHは固定時刻のgoldenと比較。実ブラウザでも同じ528×792四階調PNGを処理し、timestampの4 bytesのみ正規化して比較する。

グレースケールは整数BT.601係数、brightness倍率、contrastは平均値中心。CanvasのリサイズはPillow Lanczosとは異なる。Floyd-Steinbergは2行のFloat32誤差バッファで独自実装し、Pillowのパレット量子化キャッシュ/丸めと完全一致は約束しない。BayerとNoneは固定4階調。形式互換性と画素差を混同しない。

## 通信・配布

本番は相対baseの静的ファイル。外部CDN/フォント/分析なし。HTML CSPでconnect-src none、worker-src self。File/Blob/Canvasのみを使い、fetch/XHR/WebSocket/フォーム送信はしない。Nodeは開発/CI専用。画像やテスト入力500枚をリポジトリへ追加しない。

## 次にやること

1. X3実機で階調・上下左右・日本語タイトル・500ページ送りを確認。
2. macOS/Windowsの通常Chromeで実画像とメモリ使用量を確認。Safari/Firefoxは必要なら次段階。
3. サービスワーカーで静的アセットだけをキャッシュしてPWA化。ユーザー画像を自動保存しない。
4. Page.groupを利用したSave per Folder、設定プリセット保存、ZIP/CBZ（展開上限・パス検証付き）。

現時点ではリロード後のセッション復元、個別画像設定、クロップ位置調整、ZIP/CBZ、PDF/EPUB、Wi-Fi転送はない。元画像は保持せず、タブ終了で参照が消える。
