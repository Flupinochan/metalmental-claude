# S3 BucketPolicy

## 例

```yaml
Type: AWS::S3::BucketPolicy
Properties:
  Bucket: !Ref S3Bucket
  PolicyDocument:
    Version: "2012-10-17"
    Statement:
      - Sid: RestrictToTLSRequestsOnly
        Effect: Deny
        Principal: "*"
        Action: "s3:*"
        Resource:
          - !GetAtt S3Bucket.Arn
          - !Sub "${S3Bucket.Arn}/*"
        Condition:
          Bool:
            aws:SecureTransport: "false"
```

## HTTPリクエストの拒否

S3はデフォルトでHTTPとHTTPSの両方を受け付けるため、HTTPを明示的に拒否するBucketPolicyを設定すること

以下のSecurity Hub、Configのルールに準拠するために必要

| ルール                               | 内容                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| Security Hub `S3.5`                  | S3バケットはSSL (HTTPS) を使うリクエストを要求すること |
| Config `s3-bucket-ssl-requests-only` | HTTPのリクエストを明示的に拒否していること             |
