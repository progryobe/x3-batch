# X3 Batch Web

JPEG / PNGを、XTEINK X3用の1冊のXTCHへ。画像・プレビュー・変換はすべてブラウザ内で処理します。バックエンド、画像アップロード、アカウント、デバイス通信はありません。

## 使う

デスクトップ版Chrome / Edgeで公開URLを開き、画像またはフォルダを追加 → プレビューで調整 → **Export XTCH** → **XTCHを保存**。

- X3標準：528 × 792、4階調グレー。
- JPG / JPEG / PNG、複数選択、フォルダ選択、ファイル・フォルダのドロップ。
- 自然順（1 → 2 → 10）、サムネイル、ドラッグ並べ替え、前後移動、ページ削除。
- Fit（白余白）/ Fill（中央クロップ）、明るさ、コントラスト、Floyd-Steinberg / なし / Bayer。
- 原画像 / 変換後 / 左右比較。設定は全ページ共通、プレビューは選択ページだけ更新。
- 進捗、キャンセル、1冊のXTCHダウンロード。

画像は選択したタブ内のFile参照として保持します。更新・タブを閉じるとページ一覧は失われます。サイト配信用のHTML/JS/CSSは取得しますが、選択画像・ファイル名を送信する処理はありません。解析SDK・外部フォント・CDNスクリプトも不使用。productionには `connect-src 'none'` のCSPを付けています。

目安は500枚、上限は2000枚・1画像50 MP / 100 MiB。500ページで出力は52,291,312 bytes（約49.9 MiB）です。生成後の出力データとダウンロード用Blobには、そのサイズに応じたメモリが必要です。すべての元画像を同時に展開する構成ではありません。

## 開発

Node.js 22.12以降または24を使用します。利用者にはNode.jsもPythonも不要です。

```bash
cd web
npm ci
npm run dev
```

## 静的ビルド

```bash
cd web
npm run build
npm run preview
```

`web/dist/` の中身だけを静的ホストへ置きます。Viteの `base: './'` によりルートでも `/リポジトリ名/` でも同じビルドを使えます。HTTP(S)で配信してください。`file://` でindex.htmlを直接開く方式には対応しません。`npm run dev` / `preview` のサーバーは開発・確認専用で、本番にNodeサーバーは不要です。

## GitHub Pagesへ公開

1. GitHubにこのプロジェクト用のリポジトリを作り、**プロジェクトルート全体**を `main` ブランチへpushします。`web` だけでなく `.github/workflows/pages.yml` と `reference/python` も含めます。
2. Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions** を選びます。
3. **Actions → Test and deploy GitHub Pages** を実行（またはmainへpush）。テスト・build後にdeployされ、Pages画面とActionsの出力に公開URLが表示されます。

初回の例（空の新規リポジトリを先に作成）：

```bash
git init -b main
git add .
git commit -m "Add client-only X3 Batch Web"
git remote add origin https://github.com/YOUR_ACCOUNT/x3-batch.git
git push -u origin main
```

GitHub CLIを使える場合はリポジトリを作成してpushできます。

```bash
gh repo create x3-batch --public --source . --remote origin --push
```

非公開リポジトリからのPages公開可否はGitHubプランに依存します。ユーザーの画像をリポジトリに追加する必要はありません。

## テスト

```bash
cd web
npm test                    # Pythonのgolden bytesとの比較を含む11テスト
npm run build
npx playwright install chromium
cd ..
python3 -m pip install Pillow==12.3.0 numpy==2.3.5
python3 scripts/generate-benchmark.py
cd web
npm run test:browser        # サブパス配信、ダウンロード、操作、500枚、キャンセル等
```

Pythonからgolden fixturesを再生成：`python3 scripts/generate-fixtures.py`。既存Pythonコードは変更していません。CIでは再生成後に差分がないことも確認します。

## 構成・互換性

- `web/`：Vite / React / TypeScript / Web Worker。`src/core/xtch.ts` がXTH / XTCH生成。
- `reference/python/`：前回の `X3-Batch-MVP-0.1.0` をそのまま保持。
- `docs/DEVELOPMENT.md`：構成と拡張点。
- `docs/VALIDATION.md`：実施した検証と制限。

XTHの走査順・プレーン・MD5、XTCHヘッダー・索引・メタデータはPython版を基準にしています。**リサイズフィルターとFloyd-Steinbergの丸めはCanvas / JavaScriptとPillowで異なるため、任意の元画像に対する画素の完全一致は保証しません。** 同じ確定4階調データから生成するXTHは完全一致をテストします。

X3実機での表示、macOS / Windows実機、Safari / Firefoxは別途確認が必要です。PWA、ZIP / CBZ、PDF / EPUB、個別クロップ位置、Save per Folder、プリセット保存、Wi-Fi転送は今回の範囲外です。

## ライセンス

MIT。参考元と依存ライブラリは `NOTICE.md` と `licenses/`。ブラウザ配布物にも通知を含めます。Python参考版のQt等はWeb版へ同梱しません。
