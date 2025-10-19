# Build stage - Use Amazon Corretto to match toolchain requirement
FROM amazoncorretto:21-alpine AS builder

# Install Gradle
RUN apk add --no-cache wget unzip && \
    wget https://services.gradle.org/distributions/gradle-8.5-bin.zip && \
    unzip gradle-8.5-bin.zip -d /opt && \
    rm gradle-8.5-bin.zip && \
    ln -s /opt/gradle-8.5/bin/gradle /usr/bin/gradle

WORKDIR /build

# Copy gradle files
COPY sunrei-server/build.gradle.kts \
     sunrei-server/settings.gradle.kts \
     sunrei-server/gradle.properties ./

COPY sunrei-server/gradle ./gradle

# Copy source code
COPY sunrei-server/src ./src

# Copy API specs
COPY sunrei-api ../sunrei-api

# Build the application
RUN gradle buildFatJar --no-daemon

# Runtime stage
FROM amazoncorretto:21-alpine

WORKDIR /app

# Copy the built JAR
COPY --from=builder /build/build/libs/sunrei-server-all.jar ./sunrei-server.jar

# Copy configuration files
COPY sunrei-server/src/main/resources/application.conf ./application.conf
COPY sunrei-server/src/main/resources/application-prod.conf ./application-prod.conf
COPY sunrei-server/src/main/resources/logback.xml ./logback.xml

# Create a non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 3100

ENV PORT=3100

# Set active profile to prod
ENV KTOR_ENV=prod

# Start the application
# Note: Database migrations should be run separately as an init container or deployment step
CMD ["java", "-jar", "sunrei-server.jar", "-config=application-prod.conf"]
