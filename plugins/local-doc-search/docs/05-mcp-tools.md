# MCPツール

MCPサーバー名は`local-search`
Claude側では`mcp__plugin_local-doc-search_local-search__<tool>`として名前空間化される

## 一覧

| カテゴリ | ツール | 引数 (`*`は必須) | 読み取り専用 |
|---|---|---|---|
| 対象管理 | `add_search_path` | `path*`, `recursive` | いいえ |
| 対象管理 | `remove_search_path` | `path*` | いいえ |
| 対象管理 | `list_search_paths` | なし | はい |
| インデックス | `start_indexing` | `paths`, `mode` | いいえ |
| インデックス | `get_index_status` | なし | はい |
| インデックス | `cancel_indexing` | なし | いいえ |
| 検索 | `search_fulltext` | `query*`, `limit`, `path_prefix`, `extensions` | はい |
| 検索 | `search_semantic` | 同上 | はい |
| 検索 | `search_hybrid` | 同上 | はい |

## 返却仕様

### 本文を返さない理由

検索ツールは「どこを読むべきか」だけを返す
本文はClaudeが`Read`ツールで必要な範囲だけ読む (two-phase retrieval)

- コンテキストは推論のための領域であり、データ保管のための領域ではない
- 本文を返すとClaude Codeの`Read`ツールと役割が重複する
- 行番号があれば前後の文脈を含めて読み直せる

### SearchHit

```python
class SearchHit(BaseModel):
    rank: int              # 1始まりの順位
    file_path: str         # 元ファイルの絶対パス。ユーザに提示するのはこちら
    text_path: str         # Readすべきパス。平文ならfile_pathと同一
    ext: str               # 元ファイルの拡張子
    start_line: int        # text_path上の行番号、1始まり、両端含む
    end_line: int
    score: float           # モードごとに意味が異なる。同一レスポンス内でのみ比較可能
    fts_rank: int | None   # hybrid時のみ
    vector_rank: int | None
```

`text_path`は要件の「パス+行番号+スコアのみ」に対する追加
PDFやWord文書は元ファイルに行番号の概念がなく、`Read`で開けないため
本文を返さないという原則は維持される

**ユーザーに提示するのは常に`file_path`**
`text_path`が内部キャッシュを指す場合、ユーザーには意味を持たない

### SearchResult

```python
class SearchResult(BaseModel):
    query: str
    mode: Literal["fulltext", "semantic", "hybrid"]
    hits: list[SearchHit]
    total_candidates: int  # limit適用前の候補数
    elapsed_ms: int
    notes: list[str]       # 短語フォールバック等の注意喚起
```

### scoreの意味

| モード | 意味 |
|---|---|
| `fulltext` | bm25を結果集合内でmin-max正規化した0..1 |
| `semantic` | `1 - コサイン距離`を0以上にクリップ |
| `hybrid` | RRFスコア、`sum(1 / (rrf_k + rank))` |

いずれも同一レスポンス内でのみ比較可能
モードをまたいだ比較や、異なるクエリ間の比較には使えない

## 対象管理

### add_search_path

検索対象フォルダを登録する。この時点ではインデックスを作成しない

| 引数 | 既定 | 内容 |
|---|---|---|
| `path` | 必須 | フォルダの絶対パス |
| `recursive` | `true` | サブフォルダも対象にするか |

処理

1. `~`を展開し、シンボリックリンクを解決して絶対パス化する
2. 存在確認、ディレクトリ判定、読み取り権限確認。不正なら`MCPError(INVALID_PARAMS)`
3. 登録済みフォルダとの包含関係を判定。親子どちらの方向でも登録を拒否する
4. 対象ドキュメント数を数える (5000件で打ち切り)

包含関係を拒否する理由は、同じファイルが2つのrootから走査され`files.path`のUNIQUE制約に衝突するため

戻り値の`registered`が`false`の場合、`conflict`に理由が入る

### remove_search_path

登録とインデックスを削除する。**元のドキュメントは削除しない**

登録されていない場合もエラーにせず、`removed: false`として報告する

### list_search_paths

登録済みフォルダ、ファイル数、チャンク数、DBサイズを返す

## インデックス

### start_indexing

バックグラウンドでインデックス作成を開始し、即座に返る

| 引数 | 既定 | 内容 |
|---|---|---|
| `paths` | 全登録フォルダ | 対象を限定する場合に指定 |
| `mode` | `incremental` | `full`は全ドキュメントを再構築 |

同時に実行できるジョブは1つ
実行中に呼ばれた場合、`already_running: true`と既存の`run_id`を返す

登録フォルダがない場合、エラーではなく`run_id: null`とメッセージを返す

### get_index_status

進捗を返す。実行中でも即座に返るためポーリングして良い

| `state` | 意味 |
|---|---|
| `idle` | 一度も実行していない |
| `preparing_model` | 埋め込みモデルの準備中 (初回は数GBのダウンロード) |
| `running` | インデックス作成中 |
| `completed` | 完了 |
| `failed` | 失敗、`recent_errors`に理由 |
| `cancelled` | 中止 |
| `interrupted` | 前回がサーバー再起動などで中断 |

`model_ready`が`false`の間は`search_semantic`と`search_hybrid`の意味検索部分が使えない
`notes`にはチャンク設定の不一致やモデル取得失敗の理由が入る

### cancel_indexing

実行中のジョブに停止を要求する。処理済みの分は検索可能なまま残る

実行中でない場合、`cancelled: false`として報告する

## 検索

3ツールとも引数は共通 (`search_hybrid`のみ将来的に`rrf_k`を追加しうる)

| 引数 | 既定 | 内容 |
|---|---|---|
| `query` | 必須 | 検索語 |
| `limit` | 10 | 最大件数 (1〜50) |
| `path_prefix` | なし | このパス配下に限定 |
| `extensions` | なし | 拡張子で限定。`.pdf`と`pdf`のどちらの表記も可 |

### 使い分け

| ツール | 適した場面 |
|---|---|
| `search_hybrid` | 既定。迷ったらこれを使う |
| `search_fulltext` | 固有名詞、型番、エラーメッセージなど完全一致を狙う場合 |
| `search_semantic` | 言い換えや曖昧な問いで、キーワードが文書に含まれない見込みの場合 |

### エラーにしないケース

以下は例外ではなく空の結果と`notes`で報告する

- 該当なし
- 検索語が空
- インデックスが空
- FTS5の予約語や演算子を含む入力 (`NOT`、`AND`、`-`、`(` など)
- 埋め込みモデルが利用できない (`search_hybrid`は全文検索のみで継続)
