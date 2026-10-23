## SonarQubeの解析

レビュー対象のファイルごとに、SonarQube MCPの`analyze_code_snippet`で解析し、検出されたissueを指摘すること

## 手順

- レビュー対象のファイルを`Read`ツールで読み込む
- 以下の引数で`analyze_code_snippet`を呼び出す
  - `fileContent`: 読み込んだファイル全体の内容
  - `language`: 拡張子から判断する、例として`.py`は`python`、`.ts`は`ts`
  - `scope`: テストファイルは`TEST`、それ以外は`MAIN`
  - `projectKey`: 指定しない
- 返却された`issues`の各issueを指摘とする
  - `line`は`textRange.startLine`
  - `reason`は`ruleKey`と`primaryMessage`を日本語に要約したもの、例として`python:S5754: 例外クラスを指定せずにexceptしている`
- レビュー対象がdiff形式の場合は、変更された行のissueのみを指摘する

`deprecationNotice`などツール自体の通知は、指摘にしない

対応言語に無い拡張子のファイルは、解析しない

`analyze_code_snippet`が初期化中のエラー (`Server initialization is taking longer than expected`) を返した場合は、`Bash`ツールで`sleep 15`を実行して待機し、再度呼び出す
再試行は最大3回までとする

再試行しても SonarQube MCPが利用できない場合は、レビュー対象の先頭ファイルの1行目への指摘として`SonarQube MCPを設定してください`を返すこと
