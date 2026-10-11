buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath("org.postgresql:postgresql:42.7.1")
        classpath("org.flywaydb:flyway-database-postgresql:10.7.1")
    }
}

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
    id("org.openapi.generator") version "7.2.0"
    alias(libs.plugins.flyway)
}

group = "com.sunrei"
version = "1.0.0"

application {
    mainClass = "com.sunrei.ApplicationKt"
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.server.cors)
    implementation(libs.ktor.server.call.logging)
    implementation(libs.ktor.server.auth)
    implementation(libs.ktor.server.auth.jwt)
    implementation(libs.ktor.server.di)
    implementation(libs.ktor.server.status.pages)
    implementation(libs.ktor.server.config.yaml)

    implementation(libs.exposed.core)
    implementation(libs.exposed.dao)
    implementation(libs.exposed.jdbc)
    implementation(libs.exposed.kotlin.datetime)
    implementation(libs.exposed.json)
    implementation(libs.postgresql)
    implementation(libs.hikaricp)
    implementation("net.postgis:postgis-jdbc:2.5.1")

    implementation(libs.flyway.core)
    implementation(libs.flyway.database.postgresql)
    runtimeOnly(libs.postgresql)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)

    implementation(libs.ulid.creator)
    implementation(libs.java.jwt)

    implementation("com.google.api-client:google-api-client:2.7.0")
    implementation("com.google.oauth-client:google-oauth-client:1.36.0")
    implementation("com.google.http-client:google-http-client-gson:1.45.0")

    implementation(libs.aws.s3)

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)

    implementation(libs.thumbnailator)

    implementation(libs.logback.classic)

    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.kotlin.test.junit)
}

tasks.register<org.openapitools.generator.gradle.plugin.tasks.GenerateTask>("generateAppApi") {
    generatorName.set("kotlin")
    inputSpec.set("$rootDir/../sunrei-api/app-api-spec.yaml")
    outputDir.set("$buildDir/generated-app")
    apiPackage.set("com.sunrei.generated.api.app")
    modelPackage.set("com.sunrei.generated.dto.app")
    // 명세에서 지운 schema의 DTO가 남지 않도록 생성하기 전에 출력 폴더를 비운다.
    doFirst { delete("$buildDir/generated-app") }
    configOptions.set(
        mapOf(
            "dateLibrary" to "kotlinx-datetime",
            "serializationLibrary" to "kotlinx_serialization",
            "enumPropertyNaming" to "UPPERCASE",
            "collectionType" to "list"
        )
    )
    generateApiDocumentation.set(false)
    generateModelDocumentation.set(false)
    generateApiTests.set(false)
    generateModelTests.set(false)

    globalProperties.set(
        mapOf(
            "models" to "",
            "apis" to "false",
            "supportingFiles" to "false"
        )
    )
}

tasks.register<org.openapitools.generator.gradle.plugin.tasks.GenerateTask>("generateAdminApi") {
    generatorName.set("kotlin")
    inputSpec.set("$rootDir/../sunrei-api/admin-api-spec.yaml")
    outputDir.set("$buildDir/generated-admin")
    apiPackage.set("com.sunrei.generated.api.admin")
    modelPackage.set("com.sunrei.generated.dto.admin")
    doFirst { delete("$buildDir/generated-admin") }
    configOptions.set(
        mapOf(
            "dateLibrary" to "kotlinx-datetime",
            "serializationLibrary" to "kotlinx_serialization",
            "enumPropertyNaming" to "UPPERCASE",
            "collectionType" to "list"
        )
    )
    generateApiDocumentation.set(false)
    generateModelDocumentation.set(false)
    generateApiTests.set(false)
    generateModelTests.set(false)

    globalProperties.set(
        mapOf(
            "models" to "",
            "apis" to "false",
            "supportingFiles" to "false"
        )
    )
}

tasks.register("generateProtocols") {
    dependsOn("generateAppApi", "generateAdminApi")
    description = "Generate DTOs from OpenAPI specifications"
    group = "code generation"
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

kotlin {
    jvmToolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }

    sourceSets {
        main {
            kotlin.srcDir("$buildDir/generated-app/src/main/kotlin")
            kotlin.srcDir("$buildDir/generated-admin/src/main/kotlin")
        }
    }
}

tasks.compileKotlin {
    dependsOn(tasks.named("generateProtocols"))
}

tasks.clean {
    delete("$buildDir/generated-app")
    delete("$buildDir/generated-admin")
}

flyway {
    // 환경 변수가 없으면 docker-compose.yml로 띄운 로컬 DB에 접속한다.
    url = System.getenv("DB_URL") ?: "jdbc:postgresql://localhost:5432/sunrei"
    user = System.getenv("DB_USER") ?: "sunrei"
    password = System.getenv("DB_PASSWORD") ?: "sunrei"
    driver = "org.postgresql.Driver"
    schemas = arrayOf("public")
    locations = arrayOf("filesystem:src/main/resources/db/migration")
    cleanDisabled = false
    baselineOnMigrate = true
    validateMigrationNaming = true
}

tasks.register("syncDatabase") {
    group = "database"
    description = "Run Flyway migrations to sync database schema"
    dependsOn("flywayMigrate")

    doFirst {
        println("Running database migrations...")
        println("Database URL: ${flyway.url}")
        println("Database User: ${flyway.user}")
    }

    doLast {
        println("Database migration completed successfully!")
    }
}

tasks.register("showMigrations") {
    group = "database"
    description = "Show current migration status"
    dependsOn("flywayInfo")
}

tasks.register("validateMigrations") {
    group = "database"
    description = "Validate applied migrations against available ones"
    dependsOn("flywayValidate")
}
