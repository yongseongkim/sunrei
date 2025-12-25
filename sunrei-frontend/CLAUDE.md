# Sunrei Frontend

성지순례 장소를 지도에서 탐색하는 웹 애플리케이션 monorepo

```
sunrei-frontend/
├── packages/
│   ├── sunrei-app/      # 메인 서비스, 지도 기반 성지순례 탐색 서비스
│   └── sunrei-admin/    # 컨텐츠 관리를 위한 관리자 페이지
└── package.json
```

현재 로그인은 구글 로그인만 지원한다.
어드민은 특별 권한이 있는 사용자만 접근 가능하다.

## 기술 스택

- Next.js 15, React 19, TypeScript
- Tailwind CSS, shadcn/ui
- Google Maps API
- TanStack Query, Zustand
- pnpm workspaces

## Prerequisites

- pnpm

```bash
pnpm dev          # 전체 앱 실행
pnpm dev:app      # sunrei-app만 실행
pnpm dev:admin    # sunrei-admin만 실행
pnpm build        # 전체 빌드
```
