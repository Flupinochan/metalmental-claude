# SonarQube を Tailscale 経由で GitHub Actions から実行する手順

## 1. Tagを定義

Tailscale 管理画面の `Access controls` -> `JSON editor` で `tagOwners` に追加

```json
{
  "tagOwners": {
    "tag:ci": ["owner@example.com"],
    "tag:sonarqube": ["owner@example.com"]
  }
}
```

## 2. SonarQubeにTagを付与

1. `Network` -> `Machines` を開く
2. SonarQube を選択
3. `Machine settings` -> `Edit ACL tags...` を選択
4. `tag:sonarqube` を追加してSave

## 3. ACLで接続許可

`Access controls` -> `JSON editor` で `grants` に追加

```json
{
  "grants": [
    {
      "src": ["tag:ci"],
      "dst": ["tag:sonarqube"],
      "ip": ["tcp:443"]
    }
  ]
}
```

## 4. OAuth Clientを作成

1. `Settings` -> `Trust credentials` を開く
2. `+Credential` -> `OAuth` を選択
3. Scopesは `Keys` -> `Auth Keys` -> `Write` にチェック
4. Tagsは `tag:ci` を選択
5. `Generate credential` で作成
6. `Client ID` と `Client secret` を控える

## 5. GitHub Secretsを登録

Settings、Secrets and variables、Actions に登録

| 名前                 | 値                           | 例                  |
| -------------------- | ---------------------------- | ------------------- |
| `SONAR_HOST_URL`     | SonarQube の URL             | https://example.com |
| `SONAR_TOKEN`        | SonarQube で発行したトークン | squ_xxx             |
| `SONAR_PROJECT_KEY`  | SonarQube のプロジェクトキー | xxx                 |
| `TS_OAUTH_CLIENT_ID` | 手順4の Client ID            | xxx                 |
| `TS_OAUTH_SECRET`    | 手順4の Client secret        | tskey-xxx           |

## 6. workflowを追加

`.github/workflows/sonarqube.yml`

```yaml
name: sonarqube

on:
  pull_request:
    branches:
      - master

permissions:
  contents: read

jobs:
  sonarqube:
    name: SonarQube
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: tailscale/github-action@99a8333667fff04fdd6cffb46dfd409f8329a7bf # v4
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci
      - uses: SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9 # v8
        with:
          args: -Dsonar.projectKey=${{ secrets.SONAR_PROJECT_KEY }}
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
      - uses: SonarSource/sonarqube-quality-gate-action@7a5fffe8e523c40e0c740b6bc2712ab503e52efa # v1.2.1
        timeout-minutes: 5
        with:
          pollingTimeoutSec: 600
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

## 7. SonarQubeの設定ファイルを作成

- リポジトリ直下に `sonar-project.properties` を作成
- 必要に応じて解析対象ファイルを指定、除外

```ini
sonar.sourceEncoding=UTF-8
sonar.sources=.
sonar.exclusions=**/node_modules/**,**/.venv/**,**/types/**,**/*.d.ts,**/package-lock.json,**/uv.lock,**/docs/**
sonar.test.inclusions=**/tests/**,**/*.test.ts,**/*.test.tsx
```

## 8. 動作確認

PR を作成し、Actions の SonarQube ジョブのすべてのステップが成功することを確認

## 参考

- [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
- [Tailscale policy syntax](https://tailscale.com/kb/1337/policy-syntax)
- [Tailscale grants](https://tailscale.com/kb/1324/grants)
- [Tailscale tags](https://tailscale.com/kb/1068/tags)
- [Tailscale OAuth clients](https://tailscale.com/kb/1215/oauth-clients)
- [Tailscale GitHub Action](https://tailscale.com/kb/1276/tailscale-github-action)
- [tailscale/github-action](https://github.com/tailscale/github-action)
- [SonarSource/sonarqube-scan-action](https://github.com/SonarSource/sonarqube-scan-action)
- [SonarQube Server GitHub Actions](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/ci-integration/github-actions)
