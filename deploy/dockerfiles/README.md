# Database Migration

## 로컬 개발

```bash
cd sunrei-server
./gradlew syncDatabase
```

## k3s/Kubernetes

```bash
# 기본 실행
kubectl run sunrei-migration-$(date +%s) \
  --image=yny.ocir.io/axrudau2tcfl/sunrei/sunrei-migration:v0.0.6 \
  --restart=Never --rm -i \
  --overrides='
{
  "spec": {
    "imagePullSecrets": [{"name": "oci-registry-secret"}],
    "containers": [{
      "name": "migration",
      "image": "yny.ocir.io/axrudau2tcfl/sunrei/sunrei-migration:v0.0.6",
      "env": [
        {"name": "FLYWAY_URL", "value": "jdbc:postgresql://postgres.database.svc.cluster.local:5432/sunrei"},
        {"name": "FLYWAY_USER", "value": "postgres"},
        {"name": "FLYWAY_PASSWORD", "value": "q8Ls@33NLzeR"}
      ]
    }]
  }
}'
```
