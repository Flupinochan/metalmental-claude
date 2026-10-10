---
name: iac
description: このスキルは、ユーザーが「AWSのリソースを作成して」「CloudFormationを定義して」「TerraformでAWSのリソースを定義して」「AWS CDKを利用して」のように、AWSのリソースを作成、IaC定義したい場合に使用する。AWSリソースの作成時は、必ず本スキルを参照して推奨設定を確認する
allowed-tools: AskUserQuestion Read
---

## 概要

CloudFormationをもとに説明しているが、どのIaCでも設定可能な項目は同じであり、TerraformやCDKでも同様に適用すること

## 一覧

作成するリソースに応じて、以下のファイルを`Read`ツールで読み込み、推奨設定を確認すること

- [ECR Repository](./references/ECR/Repository.md)
- [Logs LogGroup](./references/Logs/LogGroup.md)
- [S3 Bucket](./references/S3/Bucket.md)
- [S3 BucketPolicy](./references/S3/BucketPolicy.md)

※各ファイルの`## 例`は、基本的に開発環境の場合の定義例

## その他のリソース

作成するリソースが一覧にない場合は、推測で設定せず、公式ドキュメントをその都度確認すること

確認する際は、一例だが、以下の観点で推奨設定を確認すると良い

| 観点         | 推奨設定                                                           | 理由                                                 | 設定例                                                              |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| コスト       | CloudWatch Logsの明示的な定義と保存期間の設定                      | デフォルトは無期限保存で、課金が増え続けるため       | `RetentionInDays: 30`                                               |
| セキュリティ | 自動作成のIAM Role、IAM Policyを避けた、最小権限での明示的な定義   | 自動作成されるものは権限が広くなりやすいため         | 必要なActionとResourceのみを許可したIAM Policy                      |
| タグ付け     | 全リソースへのタグ設定                                             | 環境別のコストを把握できるようにするため             | `Tags`での`Environment`の定義                                       |
| 信頼性       | 本番環境の復旧できないリソースへの、削除時の保持と誤削除防止の設定 | スタック削除や誤操作でデータを失うと復旧できないため | `DeletionPolicy: Retain`、`DeletionProtectionEnabled: true`         |
| 運用         | デフォルトで無効なログの有効化                                     | 障害調査や監査の際に、ログがないと原因を追えないため | ALBの`LoadBalancerAttributes`における`access_logs.s3.enabled: true` |

## ユーザへの確認

ユーザへの確認事項がある場合は、`AskUserQuestion`ツールを使うこと
