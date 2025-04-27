# Database Seeding Guide

## Overview
로컬 개발 환경에서 mock data를 자동으로 추가하는 seed 스크립트입니다.

## Mock Data 내용

### 🎬 Sunrei (애니메이션 작품)
1. **너의 이름은** - 신카이 마코토 감독의 대표작
2. **날씨의 아이** - 도쿄를 배경으로 한 판타지 로맨스
3. **스즈메의 문단속** - 일본 각지를 여행하는 모험

### 📍 Places (실제 장소)
- 스가 신사 (너의 이름은)
- 롯폰기 힐즈 (날씨의 아이)
- 미야자키 아오시마 (스즈메의 문단속)
- 외 4곳

### 🎯 SunreiSpots (성지)
각 작품별로 2-3개의 주요 장면 촬영지

## 사용 방법

### 1. 초기 설정 (DB + Seed)
```bash
# DB를 완전히 리셋하고 seed data 추가
npm run db:reset
```

### 2. Seed만 실행
```bash
# 이미 DB가 있을 때 seed data만 추가
npm run seed
```

### 3. 개발 시작
```bash
# DB 실행
docker-compose up -d

# Flyway 마이그레이션이 자동 실행됨

# Seed 실행 (선택사항)
npm run seed

# 서버 시작
npm run dev
```

## 주의사항

- Seed는 DB가 비어있을 때만 실행됩니다
- 이미 데이터가 있으면 스킵됩니다
- 모든 이미지는 Lorem Picsum을 사용한 placeholder입니다

## 데이터 구조

```typescript
Sunrei (작품)
  └── SunreiSpot (성지)
        └── Place (실제 장소)
```

## 추가/수정

`src/seeds/seed-data.ts` 파일을 수정하여 mock data를 변경할 수 있습니다.