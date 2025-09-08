# Sunrei Server (Ktor)

Sunrei 프로젝트의 Kotlin + Ktor 기반 백엔드 서버입니다.

## 기술 스택

- **Kotlin** + **Ktor** - 웹 프레임워크
- **Exposed** - ORM
- **PostgreSQL** - 데이터베이스

## 환경 설정

### 설정 파일 (HOCON 형식)

- `application.conf` - 기본 공통 설정
- `application-local.conf` - 로컬 개발 환경 설정 (기본값 포함)
- `application-production.conf` - 프로덕션 환경 설정 (환경 변수 사용)

### 개발 환경 (기본)

```bash
./gradlew run --args="-config=application-local.conf"
```

#### 프로덕션 환경

```bash
# 필수 환경 변수 설정
export DATABASE_HOST=prod-db.sunrei.com
export DATABASE_NAME=sunrei_prod
export DATABASE_USER=sunrei_prod
export DATABASE_PASSWORD=your_secure_password
export JWT_PAGE_TOKEN_SECRET=your_jwt_secret
export AWS_ACCESS_KEY_ID=your_aws_key
export AWS_SECRET_ACCESS_KEY=your_aws_secret

./gradlew buildFatJar
java -jar build/libs/sunrei-server-1.0.0.jar -config=application-production.conf
```
