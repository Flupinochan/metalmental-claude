# 技術選定

## 採用した構成

| レイヤー | 採用 | 理由 |
|---|---|---|
| 全文検索 | SQLite FTS5 (trigram) | Python標準`sqlite3`に内蔵、日本語も形態素解析器なしで扱える |
| ベクトル検索 | sqlite-vec | FTS5と同一の`.db`ファイルに同居、DBファイル1つで完結 |
| Embedding | BGE-M3 | 日本語精度が高い、ローカル完結、1024次元、最大8192トークン |
| 文書テキスト抽出 | MarkItDown | MITライセンス、PDF/Officeを単一ライブラリで扱える |
| エンコーディング判定 | charset-normalizer | 日本語PCに実在するCP932/Shift_JISへの対応 |
| MCPサーバー | 公式SDK `mcp` の`MCPServer` | デコレータでボイラープレート削減、依存を増やさない |

## 全文検索エンジンの比較

| 候補 | 採否 | 理由 |
|---|---|---|
| SQLite FTS5 (trigram) | 採用 | 追加依存なし、日本語対応、bm25ランキング内蔵 |
| SQLite FTS5 (unicode61) | 却下 | 日本語を分割できず、単語境界のない言語では実用にならない |
| Tantivy | 却下 | FTS5より高速だが、日本語には別途形態素解析が必要で依存が増える |
| Whoosh | 却下 | 開発が停滞、FTS5より低速という報告あり |
| Meilisearch | 却下 | 別プロセスの常駐が必要、個人PC向けpluginには重い |

MeCabやJanomeによる形態素解析も検討したが却下した
外部辞書への依存が増え、一般利用者のセットアップ難度が上がるため

## ベクトルストアの比較

| 候補 | 採否 | 理由 |
|---|---|---|
| sqlite-vec | 採用 | FTS5と同じDBファイルに同居、チャンクIDを共有できRRF統合が単純になる |
| ChromaDB | 却下 | 別のデータストアが増え、FTS5との整合を自前で管理する必要がある |
| LanceDB | 却下 | メモリ超えデータに強いが、個人PC規模では利点が活きない |
| FAISS | 却下 | ライブラリのみで永続化やメタデータ管理を自作する必要がある |

sqlite-vecの制約として、ANNインデックス非対応で全件走査になる点がある
公式も中規模 (100万件未満) 向けと位置づけており、個人PCのドキュメント数なら許容範囲と判断した

## Embeddingモデルの比較

| 候補 | 採否 | 理由 |
|---|---|---|
| BGE-M3 | 採用 | 日本語精度が高い、多言語対応、ローカル完結 |
| multilingual-e5-large | 却下 | 同等の精度だが`query:`/`passage:`のprefixが必須で扱いが煩雑 |
| all-MiniLM-L6-v2 | 却下 | 軽量だが英語中心で日本語精度が不足 |
| ruri | 却下 | 日本語特化で高精度だが、英語混じりの文書に弱い |
| OpenAI Embeddings API | 却下 | ローカル完結の要件に反する |

### 実測した類似度

BGE-M3で正規化済みベクトルのコサイン類似度を測定した結果

| 組み合わせ | 類似度 |
|---|---|
| 確定申告 vs 税金の申告 | 0.7275 |
| 確定申告 vs Tax filing | 0.6878 |
| 確定申告 vs 買い物 | 0.4610 |
| 確定申告 vs 天気 | 0.4394 |

日英をまたいで意味を捉えられる一方、無関係な文でも0.44程度になる
このため類似度の絶対値で閾値判定せず、候補間の相対順位で扱う

## 文書テキスト抽出の比較

| 候補 | 採否 | 理由 |
|---|---|---|
| MarkItDown | 採用 | MITライセンス、PDF/DOCX/PPTXを単一APIで扱える、内容判定で拡張子の誤りにも耐える |
| PyMuPDF | 却下 | 抽出品質は最良だがAGPLライセンスで配布に制約がある |
| pdfplumber単体 | 却下 | 表抽出向けで低速、Office形式は別途対応が必要 |
| pypdf + python-docx + python-pptx | 却下 | 形式ごとの実装が必要でコード量が増える |

MarkItDownの`[pdf,docx,pptx]`extrasは内部でpdfminer.six、pdfplumber、mammoth、python-pptxを使う
いずれも許容的なライセンスでAGPLを回避できる

## MCPサーバーAPIの選択

「FastMCP」という名前が複数のものを指すため整理する

| 選択肢 | import元 | 採否 |
|---|---|---|
| 公式SDK低レベルAPI | `from mcp.server import Server` | 却下、ツール9本ではボイラープレートが多すぎる |
| 公式SDK高レベルAPI | `from mcp.server import MCPServer` | 採用、v1では`FastMCP`という名称だったものがv2で改名 |
| 独立FastMCPパッケージ | `from fastmcp import FastMCP` | 却下、PrefectHQ管理の別パッケージで依存が増える |

同梱の`mcp-server-fetch`は低レベルAPIを使っているため、本サーバーとは実装スタイルが異なる
両者が併存する点に注意

## torchのCPU版固定

PyPIのLinux向けtorchは`nvidia-cudnn-cu13`など5つのCUDAパッケージを条件付き依存として引き込む
参考値としてcudnn単体で799MB、cublasで581MBに達する

GPUを使わないため、`pyproject.toml`でCPU版インデックスへ明示的に振り向ける

```toml
[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[tool.uv.sources]
torch = { index = "pytorch-cpu" }
```

`explicit = true`により、このインデックスは`tool.uv.sources`で指定したパッケージにのみ使われる

## 環境の実測値

| 検証項目 | 結果 |
|---|---|
| FTS5 trigram | uv管理Python 3.14.5で利用可、bm25も正常動作 |
| trigramの2文字語 | `MATCH`では0件、`LIKE`では正しくヒット |
| `enable_load_extension` | uv配布のcpython-3.14で有効 |
| sqlite-vec | v0.1.9がロード可、KNN動作を確認 |
| torch | 2.13.0+cpu、`torch.version.cuda`は`None` |
| BGE-M3の初回ロード | 53.5秒 (約4.3GBのダウンロード込み) |
| 差分判定のコスト | `os.stat`は約5マイクロ秒、488KBのsha256は約1ミリ秒 |
