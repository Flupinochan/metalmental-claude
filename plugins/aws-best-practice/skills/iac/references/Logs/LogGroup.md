# Logs LogGroup

## 例

```yaml
Type: AWS::Logs::LogGroup
Properties:
  LogGroupName: "/aws/lambda/test-function"
  LogGroupClass: STANDARD
  RetentionInDays: 30
  DeletionProtectionEnabled: false
  FieldIndexPolicies:
    - Fields:
      - level
      - message
      - xray_trace_id
      - exception_name
```

## DeletionPolicy

- **本番環境**: IaCを削除した場合にログ等は削除されず残るようにしておく
- **開発環境**: 設定不要

## LogGroupName

`/aws/サービス名/...` という形式で作成

## LogGroupClass

基本的には `STANDARD` を利用

- **STANDARD**
  - CloudWatch Alarmで**異常通知が必要な場合**
- **INFREQUENT_ACCESS**
  - 異常通知は不要で詳細なデバッグログ、監査ログなど基本的には参照せず安価にログ保存したい場合
  - Metric Filterが利用できないため、CloudWatch Alarmも利用できない
- **DELIVERY**
  - Firehose経由で外部SaaS (Datadog等) に転送する場合や、S3で長期保存する場合
  - CloudWatch Logsには2日間のみ保存され、ほとんどの機能は利用できない。S3やData Firehoseに転送される

## RetentionInDays

未設定の場合は**無期限**に保存され、コストが増加するため、どの環境でも適切に設定すること

特に開発環境ではコストを抑えるため、要件がない場合は `30` (1か月) くらいを目安に設定すること

## DeletionProtectionEnabled

本番環境ではロググループを削除しないため、誤削除防止として `true` に設定する

開発環境では `false` でよい

## FieldIndexPolicies

JSON形式のログのみ対象

CloudWatch Logs Insightsの検索においてスキャン量を削減し、コスト削減するためのindex設定 (SQLのindexと同様)

完全一致 (=, IN) で検索するkeyに設定する

例で設定しているフィールドの理由 (AWS Powertoolsのログを想定)

| field            | 値の例           | 想定する検索                                  | 設定する理由                                                   |
| ---------------- | ---------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `level`          | `INFO`/`ERROR`   | `filterIndex level = "ERROR"`                 | ERRORで検索するため                                            |
| `message`        | `Payment failed` | `filterIndex message = "Payment failed"`      | 動的値を別keyに分離し、messageを固定文字列にしている場合を想定 |
| `xray_trace_id`  | `1-...`          | `filterIndex xray_trace_id = "1-..."`         | トレースIDで検索するため                                       |
| `exception_name` | `TimeoutError`   | `filterIndex exception_name = "TimeoutError"` | 例外名で検索するため                                           |

