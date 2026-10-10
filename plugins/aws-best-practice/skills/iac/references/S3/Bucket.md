# S3 Bucket

## 例

```yaml
Type: AWS::S3::Bucket
Properties:
  BucketNamePrefix: my-bucket
  BucketNamespace: account-regional
  LifecycleConfiguration:
    Rules:
      - Id: expiration-in-days
        ExpirationInDays: 1
        Status: Enabled
      - Id: abort-incomplete-multipart-upload
        Status: Enabled
        AbortIncompleteMultipartUpload:
          DaysAfterInitiation: 7
```

## BucketNamePrefix + BucketNamespace: account-regional

`BucketNamePrefix` + `BucketNamespace` はAccountIDやRegionを含んだS3 Bucket名を自動生成するため名前衝突が発生しない

`BucketName` は旧設定であり名前衝突のリスクがあるため、利用しないこと

## BucketEncryption

基本的には設定不要

デフォルトで最も安価でS3マネージドなSSE-S3で暗号化される

BucketKeyEnabledはKMS利用時の設定であり、デフォルトのSSE-S3では設定不要

## AbacStatus

複数のS3 Bucketに共通のタグを定義し、タグベースで一括でアクセス許可設定をしたい場合に利用

## CorsConfiguration

以下は設定が必要な場合の例

- 署名付きURLでCloudFrontを経由せずにS3へ直接アップロードする場合
- ローカル開発環境(http://localhost:3000)などの別ドメインからCloudFront経由でS3にアクセスする場合

## VersioningConfiguration + ReplicationConfiguration

Bucketをデータベースのようにデータ保存用として扱う場合に、バックアップ用途として設定

例: ユーザがアップロードしたファイルを保存する場合

Frontend用途の場合は設定不要

## ObjectLockEnabled + ObjectLockConfiguration

ログ等で改ざんを防止したい場合に設定

## LifecycleConfiguration

以下は設定が必要な場合の例

- Trusted Advisorの推奨設定のため、未完了のMultipartUploadは7日で中止すること
- CodePipelineのArtifact用など一時的な用途の場合は、`ExpirationInDays: 1`を設定すること
- コスト効率を高めるため、ログ用途では必要に応じて`GLACIER_IR`または`INTELLIGENT_TIERING`クラスに移行させること
  - `Glacier Flexible Retrieval`と`Deep Archive`は、Athenaで検索できなくなるのでNG
- `VersioningConfiguration`を設定している場合は、`NoncurrentVersionExpiration`を設定して旧バージョンを自動で削除すること

| StorageClass          | コスト       | 最低保存期間 | 説明                                           |
| --------------------- | ------------ | ------------ | ---------------------------------------------- |
| `STANDARD_IA`         | $0.0138/GB月 | 30日         | 複数AZに保存する低頻度アクセス向け             |
| `ONEZONE_IA`          | $0.011/GB月  | 30日         | 単一AZに保存する低頻度アクセス向け             |
| `GLACIER_IR`          | $0.005/GB月  | 90日         | 目安としては四半期に一度くらいのアクセスを想定 |
| `INTELLIGENT_TIERING` | 可変         | なし         | アクセス頻度に応じてコストが可変               |

画像や動画などサイズが大きい場合は元が取れやすいため設定すること

以下はおおよその目安

| サイズ | クラス        | 最低保存期間で移動 | 作成日から元が取れるアクセス日 |
| ------ | ------------- | ------------------ | ------------------------------ |
| 128KB  | `STANDARD_IA` | 30日               | 290日以降                      |
| 128KB  | `ONEZONE_IA`  | 30日               | 238日以降                      |
| 128KB  | `GLACIER_IR`  | 90日               | 499日以降                      |
| 1MB    | `STANDARD_IA` | 30日               | 86日以降                       |
| 1MB    | `ONEZONE_IA`  | 30日               | 75日以降                       |
| 1MB    | `GLACIER_IR`  | 90日               | 181日以降                      |
| 10MB   | `STANDARD_IA` | 30日               | 60日以降                       |
| 10MB   | `ONEZONE_IA`  | 30日               | 54日以降                       |
| 10MB   | `GLACIER_IR`  | 90日               | 140日以降                      |
| 100MB  | `STANDARD_IA` | 30日               | 57日以降                       |
| 100MB  | `ONEZONE_IA`  | 30日               | 52日以降                       |
| 100MB  | `GLACIER_IR`  | 90日               | 135日以降                      |

## IntelligentTieringConfigurations

基本的には設定不要

LifecycleConfigurationでIntelligent-Tieringを利用する場合に、手動復元が必要な`ARCHIVE_ACCESS`や`DEEP_ARCHIVE_ACCESS`を有効化する設定

## LoggingConfiguration

監査上、ログ保存が必要であれば設定

## MetadataConfiguration

objectのmetadataをApache Icebergテーブルとして保存し、SQL (Athena 等) で検索したい場合

デフォルトのmetadataとしては`Date`、`Content-Length`、`Last-Modified`等がある

要件に応じて、以下を使い分ける

- metadata: 後から変更しない固定情報
- tag: 後から変更する可能性がある情報や、IAMポリシー、ライフサイクル、コスト配分に使う情報
- annotation: 大きな説明情報

## NotificationConfiguration

S3 Objectの作成などの様々なEventを契機にSQSやLambdaを起動したい場合に利用

## AccelerateConfiguration

ap-northeast-1のS3 Bucketに対して、海外のユーザなど遠隔地からのアップロードのパフォーマンスを向上させたい場合に設定

## DeletionPolicy

データ保存用の場合は、`DeletionPolicy: Retain`を設定すること
