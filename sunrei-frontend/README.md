# Sunrei Frontend

Sunrei 웹 화면을 담은 pnpm workspace다.

- `packages/sunrei-app`은 지도를 움직이며 주변 성지순례 장소를 찾고, 채널이나 작품을 골라 그 장소들을 모아 보는 public 앱이다.
- `packages/sunrei-admin`은 운영자가 Source와 Sunrei를 등록하고, spot마다 장소와 맥락과 태그를 붙여 공개하는 admin 앱이다.

```bash
pnpm install
pnpm dev:app
pnpm dev:admin
```

환경 변수, API client 생성, 지도 상태 모델 같은 개발 규칙은 [AGENTS.md](AGENTS.md)에 있다.
