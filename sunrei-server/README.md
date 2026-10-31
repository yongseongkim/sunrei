# Sunrei Server

Sunrei의 공개 API, 어드민 API, 로그인 API를 제공하는 Kotlin 서버다.
제품과 도메인 설명은 루트 `README.md`와 `AGENTS.md`에 있다.

## 기술 스택

- Kotlin, Ktor 3, Netty
- Exposed, PostgreSQL + PostGIS, HikariCP, Flyway
- AWS S3와 Thumbnailator로 이미지 저장과 크기 변환
- Google OAuth와 JWT로 로그인

## 코드 위치

- `Application.kt`, `Routing.kt`: 설정을 읽고 plugin과 route를 등록한다.
- `routes/app/`: 인증 없이 쓰는 공개 API `/api/*`다.
- `routes/admin/`: 어드민 API `/admin/*`이며, `role` claim이 `admin`인 JWT가 있어야 한다.
- `auth/`: Google 로그인과 JWT 발급을 맡는 `/api/auth/*`다.
- `service/`: 조회와 저장 로직이다.
  지도 검색은 `PlaceService`, PlaceCard 조립은 `SunreiSpotService`, YouTube 수집 상태는 `YoutubeService`, Instagram 수집 상태는 `InstagramService`에 있다.
- `database/`는 Exposed 테이블 정의이고, `model/`은 서비스가 주고받는 도메인 모델이다.
- `com.sunrei.generated.dto.app`, `com.sunrei.generated.dto.admin`: `sunrei-api/` 명세로 빌드 때 `build/generated-*`에 생성하는 DTO다.

## 설정

`KTOR_ENV` 값으로 `src/main/resources/application-$KTOR_ENV.conf`를 고르며, 기본값은 `local`이다.

- `application.conf`: 공통 기본값이다.
- `application-prod.conf`: 운영 설정이며, Helm chart가 넣는 환경 변수에서 DB 접속 정보와 비밀 값을 읽는다.
- `application-local.conf`: gitignore 대상이라 직접 만든다.
  `ktor.deployment.host`와 `port`, `database`, `auth.jwt`, `auth.oauth.google`, `aws` 값을 채우며, 구조는 위 두 파일을 참고한다.
  프론트엔드의 로컬 API 기본 주소에 맞춰 port는 3030으로 둔다.
  이미지 버킷은 따로 두지 않고 `application.conf`의 `sunrei-resources`를 그대로 쓰므로, 로컬에서 올린 이미지도 운영과 같은 `images/` 아래에 저장된다.

## 로컬 실행

```bash
docker compose up -d     # PostgreSQL + PostGIS
./gradlew syncDatabase   # Flyway migration 적용
./gradlew run
```

Flyway Gradle task는 `DB_URL`, `DB_USER`, `DB_PASSWORD` 환경 변수를 읽고, 없으면 docker compose의 로컬 DB에 접속한다.

## 테스트

`./gradlew test`는 실행 중인 Docker를 사용해 격리된 PostGIS DB를 띄우고 migration과 spot 순서 저장·조회·추가, 거리 정렬을 검증한다.
운영 DB나 로컬 개발 DB는 사용하지 않는다.

## 규칙

- DB 스키마의 기준은 `src/main/resources/db/migration`의 Flyway migration이다.
  PostGIS extension과 `place.geom`을 좌표로 채우는 trigger도 migration이 만든다.
- 이미 적용된 migration 파일은 checksum이 달라져 운영 migration이 실패하므로 주석도 고치지 않고, 변경은 새 버전 파일로 추가한다.
- 시각 컬럼은 모두 `TIMESTAMPTZ`이고, 코드에서는 `Instant`로, API JSON에서는 `2026-06-18T00:00:00Z` 같은 UTC 값으로 다룬다.
- Google 로그인은 OAuth provider의 사용자 ID로 먼저 찾고, 없으면 같은 이메일의 사용자에 연결한다.
  새 사용자는 `user` 권한으로 만들어지며, admin 권한은 DB에서 직접 준다.
