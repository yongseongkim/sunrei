# 배포 스크립트

Docker 이미지 빌드, Helm Chart 업데이트, ArgoCD 자동 배포 스크립트입니다.

## 배포 플로우

release.sh 를 통해 버전 자동 증가 (v1.2.3 → v1.2.4) 시켜 Docker 이미지를 빌드/푸시 합니다.
그리고 Helm Chart 버전, values.yaml (1.2.4) 를 업데이트하여 commit & tag & push 합니다.
ArgoCD 가 values.yaml 변경을 감지하여 k3s 에 배포합니다.

## Requirements

- Docker (container registry 에 docker image 를 업로드)

```bash
# OCI Container Registry 인증 (최초 1회)
docker login yny.ocir.io
# Username: axrudau2tcfl/yongseongkimm@gmail.com
# Password: [OCI Auth Token]

# Auth Token 생성: OCI Console > User Settings > Auth Tokens
```

## Helm Chart

- `Chart.yaml` - Chart 메타데이터
- `values.yaml` - 이미지 태그 및 설정
- `templates/` - K8s 리소스 (Deployment, Service)

Cloudflare Tunnel 을 이용하여 k3s service 를 외부 트래픽으로 연결합니다.
ex) 외부 사용자
→ https://sunrei-api.yourdomain.com → Cloudflare Edge (전세계 CDN) → [암호화된 터널]
→ Master 노드의 cloudflared 프로세스 → 클러스터 내부 네트워크 → Sunrei Server Service ClusterIP → Sunrei Server Service Pod (10.42.1.5:3100)
