# aws-best-practice

## 概要

- AWSのリソースを作成、IaC定義する際の推奨設定をリソースごとに `references/**/*.md` として蓄積する
- CloudFormationで例を示すが、Terraform、CDKでも同様に利用できる

## 提供するSkill

| Skill | 説明                                                |
| ----- | --------------------------------------------------- |
| `iac` | 作成するAWSリソースの各設定項目の推奨値について定義 |

## 対応リソース

| CloudFormationリソース  | 参照ファイル                               |
| ----------------------- | ------------------------------------------ |
| `AWS::ECR::Repository`  | `skills/iac/references/ECR/Repository.md`  |
| `AWS::Logs::LogGroup`   | `skills/iac/references/Logs/LogGroup.md`   |
| `AWS::S3::Bucket`       | `skills/iac/references/S3/Bucket.md`       |
| `AWS::S3::BucketPolicy` | `skills/iac/references/S3/BucketPolicy.md` |

## ファイル構成

| ファイル                        | 役割                                               |
| ------------------------------- | -------------------------------------------------- |
| `skills/iac/SKILL.md`           | 入口。作成するリソースに対応する参照ファイルを記載 |
| `skills/iac/references/**/*.md` | リソースごとの推奨設定                             |

## 定義ルール

AWS CloudFormationのリソース名に合わせて定義

`AWS::S3::Bucket` の場合

- `S3/Bucket.md` を作成
  - ファイルの冒頭に `# S3 Bucket` を記載
  - その次に `## 例` を記載し **開発環境** を想定したCloudFormation YAML例を記載すること
- `SKILL.md` の `[S3 Bucket](./references/S3/Bucket.md)` を記載する
