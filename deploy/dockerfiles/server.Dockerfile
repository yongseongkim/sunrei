# build.gradle.kts의 jvmToolchain(21)에 맞춰 JDK 21 이미지를 쓴다.
FROM amazoncorretto:21-alpine AS builder

RUN apk add --no-cache wget unzip && \
    wget https://services.gradle.org/distributions/gradle-8.5-bin.zip && \
    unzip gradle-8.5-bin.zip -d /opt && \
    rm gradle-8.5-bin.zip && \
    ln -s /opt/gradle-8.5/bin/gradle /usr/bin/gradle

WORKDIR /build

COPY sunrei-server/build.gradle.kts \
     sunrei-server/settings.gradle.kts \
     sunrei-server/gradle.properties ./

COPY sunrei-server/gradle ./gradle

COPY sunrei-server/src ./src

# build.gradle.kts가 ../sunrei-api의 OpenAPI 명세로 DTO를 생성한다.
COPY sunrei-api ../sunrei-api

RUN gradle buildFatJar --no-daemon

FROM amazoncorretto:21-alpine

WORKDIR /app

COPY --from=builder /build/build/libs/sunrei-server-all.jar ./sunrei-server.jar

COPY sunrei-server/src/main/resources/application.conf ./application.conf
COPY sunrei-server/src/main/resources/application-prod.conf ./application-prod.conf
COPY sunrei-server/src/main/resources/logback.xml ./logback.xml

RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3100

ENV PORT=3100

ENV KTOR_ENV=prod

CMD ["java", "-jar", "sunrei-server.jar", "-config=application-prod.conf"]
