# ECR Repository

## 例

```yaml
Type: AWS::ECR::Repository
Properties:
  RepositoryName: team-a/web-app
  EmptyOnDelete: true
  LifecyclePolicy:
    LifecyclePolicyText: |-
      {
        "rules": [
          {
            "rulePriority": 1,
            "description": "Keep only one image in the repository.",
            "selection": {
              "tagStatus": "any",
              "countType": "imageCountMoreThan",
              "countNumber": 1
            },
            "action": {
              "type": "expire"
            }
          }
        ]
      }
  ImageTagMutability: MUTABLE
```

## RepositoryName

リポジトリ名は、必要に応じてスラッシュ(/)で区切り、名前空間として扱うこと

## EmptyOnDelete

ビルドすればimageは再作成可能なため、特別な要件がない限り`true`で削除してよい

## LifecyclePolicy

- **本番環境**: Rollbackを想定し、2,3個は最低限保存しておくべき
- **開発環境**: 1個のimageだけ保存すればよい

## ImageTagMutability

タグの上書き(pushによる同名タグの更新)を禁止する設定

- **本番環境**: latestのような固定タグ名を利用せず一意なタグ名を利用する方針の場合は、`IMMUTABLE`に設定すべき
- **開発環境**: `MUTABLE`でよい

## RepositoryPolicyText

基本的には設定不要だが、マルチアカウント構成で別アカウントから再利用したい場合は設定すること
