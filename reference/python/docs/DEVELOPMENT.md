# 継続開発メモ

## 目的と現状

約500枚の画像をMacからX3用XTCHへ一括変換する。MVPの機能は実装済み。LinuxのQtオフスクリーン試験は通過。Macのネイティブ起動・パッケージビルド・X3実機確認が残るため、その検証完了までは配布完成版とは扱わない。

## 構成の判断

Tauri 2 / Rustも候補だったが、このMVPはPython + PySide6 + Pillow + NumPyを採用。最重要参考実装が同じ画像処理系を使用しているため、形式照合・アルゴリズム移植を小さくできる。PillowのC実装でディザとリサイズを処理し、NumPyでビットパックする。Electron・ブラウザエンジン・サーバーは不要。ただしQtランタイムの配布サイズはTauriより大きい。このトレードオフを受け入れ、画像処理コアをUIから分離した。将来のWeb版ではUIとローカルファイル入出力の再設計が必要。

## 主な所在

- `x3batch/core.py`：Page / Settings、自然順、画像ロード、変換、`encode_xth`、`export_xtch`。
- `x3batch/app.py`：3ペインUI、入力、並べ替え、非同期処理、進捗。
- `tests/test_core.py`：既知ビット列、走査方向、MD5、コンテナ、逆変換、失敗時保護。
- `tests/ui_smoke.py`：500ページのGUI結合テスト。
- `scripts/verify_references.py`：upstreamの指定関数だけをASTから読み出して比較。
- `scripts/build-macos.sh`：arm64 .app作成。

一覧はパスと小さいサムネイルだけ保持する。サムネイルは可視行だけ生成、待機上限16件、1ワーカー。プレビューは160ms debounce、同時1件で変更要求をまとめ、古い結果は表示しない。コア処理プールは最大2スレッド。書き出しは1枚ずつ処理し、ページデータを出力後にインデックスを埋める。全ページ分のピクセル・XTHを保持しない。設定と順序は書き出し開始時にスナップショット化。

PNGは1枚分のデコードメモリが必要。50 MP超の画像は安全のためエラーにする。極端に大きい画像では画面操作に多少影響する可能性があり、500枚の実画像でもMac側で測定する。プレビュー用と出力用は同じ `process` を使う。

## 参考OSSと利用範囲

2026-10-07に取得した以下のcommitを調査。参照コード自体は配布物に含めない（ライセンス文面を除く）。

| OSS | commit | ライセンス | 利用・確認 |
|---|---|---|---|
| [XteinkImageRefiner](https://github.com/feeeeeeen/XteinkImageRefiner) | 765f906afbd0437bcd4ea77f5b0a19b9dbdeed08 | MIT表記 | `image_processor.py` のsave_xthを再構成して移植。create_xtc、仕様書、Resize、4階調ディザ、入力・Save per Folder設計を参照 |
| [xteink-x4-helpers](https://github.com/mk-fg/xteink-x4-helpers) | 5e18bcb9fb4cc02e256238c37ebfbd8b1e6dece0 | WTFPL v2 | xteink-xtcのimg_to_xth / write_xtchをクロスチェック。製品へコードコピーなし |
| [XTLibre](https://github.com/shakogegia/xtlibre) | 9d2c47a3858013edd7d419bad3bf1500f9880160 | MIT | config.ts、image-processing.ts、converter.tsx、device-preview、device-ops、device-clientを確認。プリセット分離・UIを参考。コードコピーなし |
| [X3 Calibre stock](https://github.com/ElendilDrac01/xteink-x3-calibre-stock) | e5ca0a00ac82e428ffc37ddf5aebede1f3b5a8a0 | MIT | network.py：/Read_info、/list、/edit multipart POSTを確認。将来の転送層の資料のみ。コピー・実装なし |

RefinerのAtkinson / Sauvolaも調査した。MVPでは高速なPillowの固定4色パレットFloyd-Steinbergを採用。Refinerのpalette引数の渡し方をそのままコピーせず、Pillowの `quantize(palette=...)` を使用。なし・Bayerも選択可。Atkinsonと局所二値化は追加候補。

## XTCHの判断と差異

コンテナ：56バイトヘッダー → 256バイトメタデータ → 16バイト×ページ数の索引 → 各XTH。オフセットはファイル先頭からの絶対値、整数はLittle Endian。magicは `XTCH`。索引にはXTHヘッダー込みのサイズを記録する。

XTH：22バイトヘッダー + 2つのビットプレーン。列を右→左、各列を上→下に走査。上のピクセルがバイトのMSB。高さを8の倍数へ白パディング。最初のプレーンを上位ビットとした値は白0・濃灰1・淡灰2・黒3。helpersは階調名とプレーンの順序の説明が逆だが、実際のバイト列は同じ。四階調入力で双方と完全一致を確認した。MD5はpayloadの先頭8 digest bytes。

**versionの差異**：Refinerの仕様・実装はuint16 `0x0100`（00 01）。helpersはmajor/minorの `01 00`、XTLibreもuint16 `1`（01 00）。本アプリは2実装が一致する `0x0001` を採用。その他の必須コンテナ構造は一致する。X3純正ファームのバージョン別受け入れは実機試験が必要。

4階調確定後にパックするので、upstream間の量子化閾値差（63/127/191 と42/127/212）は出力を変えない。プレビューは4階調値の見本であり実機の階調校正ではない。

## 既知の制限・次にやること

1. Apple Siliconで起動、ドロップ、500枚、.appビルドを確認。署名・公証を追加。
2. X3純正ファームでバージョン値、ページ数、日本語タイトル、上下左右と4階調を確認。
3. Save per FolderはPage.groupで分割しexport_xtchを繰り返す。UIと同名出力の衝突ルールを追加。
4. ZIP/CBZはパストラバーサル防止と展開上限が必要。
5. プリセット保存・ページ削除・X4選択を追加。

一時処理中のウィンドウ終了は待機メッセージを出す。処理の強制停止はしない。設定の保存や部分的な成功出力はしない。並べ替え状態は終了すると失われる。
