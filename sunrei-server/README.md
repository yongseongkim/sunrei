# Sunrei Server (Ktor)

Sunrei 프로젝트의 Kotlin + Ktor 기반 백엔드 서버입니다.

## 기술 스택

- **Kotlin** + **Ktor** - 웹 프레임워크
- **Exposed** - ORM
- **PostgreSQL** - 데이터베이스

## 환경 설정

### 설정 파일

- `application.yaml` - 개발 환경 설정 (기본)
- `application-production.yaml` - 프로덕션 환경 설정

## 실행 방법

### 개발 환경 (기본)

```bash
./gradlew run
```

### 프로덕션 환경

```bash
# 환경 변수 설정
export DATABASE_HOST=prod-db.sunrei.com
export DATABASE_USER=sunrei_prod
export DATABASE_PASSWORD=your_secure_password

# JAR 빌드 및 실행
./gradlew buildFatJar
java -jar build/libs/sunrei-server-ktor-1.0.0-all.jar -config=application-production.yaml
```

## API 엔드포인트

- `GET /` - 헬스체크
- `GET /sunreis` - Sunrei 목록 조회
    - Query: `polygon` (optional) - WKT 형식의 polygon으로 필터링
- `GET /sunreis/{id}` - Sunrei 상세 조회
- `GET /sunrei-spots/{id}` - SunreiSpot 상세 조회
- `GET /tags` - 태그 목록 조회

## 데이터베이스

기존 PostgreSQL 데이터베이스와 호환됩니다. 개발 환경에서 `ENABLE_SEED_DATA=true`로 설정하면 테이블을 자동으로 생성합니다.

## 빌드 & 실행

| Task                         | Description                              |
|------------------------------|------------------------------------------|
| `./gradlew test`             | 테스트 실행                                   |
| `./gradlew build`            | 프로젝트 빌드                                  |
| `./gradlew buildFatJar`      | 모든 의존성을 포함한 실행 가능한 JAR 빌드              |
| `./gradlew run`              | 서버 실행                                    |
| `./gradlew generateProtocols`| OpenAPI 스펙에서 DTO 자동 생성                  |
| `./gradlew clean`            | 빌드 디렉토리 및 생성된 코드 정리                     |

서버가 성공적으로 시작되면 다음과 같은 출력을 볼 수 있습니다:

```
2024-12-04 14:32:45.584 [main] INFO  Application - Starting Sunrei Server in development mode
2024-12-04 14:32:45.682 [main] INFO  Application - Responding at http://0.0.0.0:3000
```

