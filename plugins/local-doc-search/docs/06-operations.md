# 運用

## 必要な環境

| 項目 | 要件 |
|---|---|
| uv | MCPサーバーの起動に必須 |
| Python | 3.14以上 (uvが自動で用意する) |
| ディスク | 埋め込みモデルに約4.3GB、加えてインデックス |
| ネットワーク | 初回のみ、モデルのダウンロードに必要 |

## セットアップ

1. pluginをインストールする
2. Claude Codeに「PCの資料を検索できるようにして」と依頼する
3. 検索対象フォルダを指定する
4. インデックス作成を開始する。**初回は数分から数十分かかる**
5. 完了後、「PCの資料から〜を探して」で検索できる

検索対象は「書類」「Documents」などドキュメントが集まるフォルダを推奨する
ホームディレクトリ全体は走査対象が膨大になり、時間とディスクを消費する

## サンドボックス環境での注意

Claude Codeのサンドボックスを有効にしている場合、以下の許可が必要になる

```json
"sandbox": {
  "network": {
    "allowedDomains": [
      "download.pytorch.org",
      "huggingface.co",
      "*.huggingface.co",
      "*.hf.co"
    ]
  }
}
```

`download.pytorch.org`は依存解決 (`uv sync`) に、HuggingFace系は埋め込みモデルの取得に必要

## ディスク使用量の目安

| 対象 | 目安 |
|---|---|
| 埋め込みモデル | 約4.3GB (固定) |
| ベクトル | 1チャンクあたり約4KB (1024次元 × float32) |
| FTS5インデックス | 元テキストの約2.6倍 |
| 抽出キャッシュ | PDF/Office文書のテキスト分 |

1万チャンクの場合、ベクトルだけで約40MBになる

## 既知の制約

| 制約 | 内容 | 回避策 |
|---|---|---|
| 2文字以下の語 | trigram索引に載らないため全走査になる | 語を増やして3文字以上にする |
| 大規模データ | sqlite-vecはANN非対応で全件走査、100万チャンク超で低速化 | 検索対象フォルダを絞る |
| 初回の待ち時間 | モデルのダウンロードに数分から数十分 | 2回目以降は発生しない |
| `.xlsx` `.rtf` | v1では非対応 | 第2フェーズで対応予定 |
| ページ番号 | PDFのページ番号は返さない、抽出後の行番号のみ | 該当行を`Read`して前後を確認する |
| 意味検索の閾値 | 無関係な文でも類似度0.4程度になる | 絶対値でなく順位で判断する |

## トラブルシュート

### 検索しても0件になる

1. `list_search_paths`でフォルダが登録されているか確認する
2. `get_index_status`で`state`が`completed`か、`total_chunks`が0でないか確認する
3. 検索語が2文字以下なら語を足す
4. `search_fulltext`で0件なら`search_semantic`を試す

### インデックス作成が終わらない

`get_index_status`の`state`を確認する

- `preparing_model`のまま → モデルのダウンロード中。ネットワークとディスク残量を確認する
- `running`で`files_scanned`が増えている → 正常。対象が多いだけ
- `interrupted` → サーバーが再起動された。`start_indexing`をやり直す

中止する場合は`cancel_indexing`を使う

### 意味検索だけ使えない

`get_index_status`の`model_ready`と`notes`を確認する
モデルの取得に失敗している場合、`search_fulltext`は引き続き利用できる

### 検索結果が古い

`start_indexing`を実行する。変更のあったファイルだけが再処理される

チャンク設定を変更した場合、`get_index_status`の`notes`に不一致が報告される
この場合は`mode="full"`で全体を再構築する

### PDFやWordの内容が検索できない

`get_index_status`の`recent_errors`を確認する
暗号化されたPDFや、テキストを含まない画像PDFは抽出できない

## 開発

```bash
cd plugins/local-doc-search/mcp-server-local-search
uv sync
uv run pytest
uv run ruff check .
uv run pyright
```

plugin全体の動作確認

```bash
claude --plugin-dir ./plugins/local-doc-search
```
