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
  --image=yny.ocir.io/axrudau2tcfl/sunrei/sunrei-migration:v0.0.5 \
  --restart=Never \
  --rm \
  -i \
  --env="FLYWAY_URL=jdbc:postgresql://postgres.default.svc.cluster.local:5432/sunrei" \
  --env="FLYWAY_USER=postgres" \
  --env="FLYWAY_PASSWORD=yourpassword"

# Secret 생성 (한 번만)
kubectl create secret generic db-migration-secret \
  --from-literal=url=jdbc:postgresql://postgres.default.svc.cluster.local:5432/sunrei \
  --from-literal=user=postgres \
  --from-literal=password=yourpassword

# Secret으로 실행
kubectl run sunrei-migration-$(date +%s) \
  --image=yny.ocir.io/axrudau2tcfl/sunrei/sunrei-migration:v0.0.5 \
  --restart=Never \
  --rm \
  -i \
  --overrides='{"spec":{"containers":[{"name":"migration","image":"yny.ocir.io/axrudau2tcfl/sunrei/sunrei-migration:v0.0.5","env":[{"name":"FLYWAY_URL","valueFrom":{"secretKeyRef":{"name":"db-migration-secret","key":"url"}}},{"name":"FLYWAY_USER","valueFrom":{"secretKeyRef":{"name":"db-migration-secret","key":"user"}}},{"name":"FLYWAY_PASSWORD","valueFrom":{"secretKeyRef":{"name":"db-migration-secret","key":"password"}}}]}]}}'
```
