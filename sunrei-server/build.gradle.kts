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
    // Ktor Server
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.server.cors)
    implementation(libs.ktor.server.call.logging)
    implementation(libs.ktor.server.status.pages)
    implementation(libs.ktor.server.config.yaml)

    // Database
    implementation(libs.exposed.core)
    implementation(libs.exposed.dao)
    implementation(libs.exposed.jdbc)
    implementation(libs.exposed.kotlin.datetime)
    implementation(libs.exposed.json)
    implementation(libs.postgresql)
    implementation(libs.hikaricp)
    implementation("net.postgis:postgis-jdbc:2.5.1")

    // Flyway
    implementation(libs.flyway.core)
    implementation(libs.flyway.database.postgresql)
    runtimeOnly(libs.postgresql)

    // Serialization
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)

    // Utilities
    implementation(libs.ulid.creator)
    implementation(libs.java.jwt)

    // AWS SDK
    implementation(libs.aws.s3)

    // Ktor Client for downloading images
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)

    // Image processing
    implementation(libs.thumbnailator)

    // Logging
    implementation(libs.logback.classic)

    // Testing
    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.kotlin.test.junit)
}

// Generate DTOs from App API spec
tasks.register<org.openapitools.generator.gradle.plugin.tasks.GenerateTask>("generateAppApi") {
    generatorName.set("kotlin")
    inputSpec.set("$rootDir/../sunrei-api/app-api-spec.yaml")
    outputDir.set("$buildDir/generated-app")
    apiPackage.set("com.sunrei.generated.api.app")
    modelPackage.set("com.sunrei.generated.dto.app")
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

    // Only generate models, not API clients
    globalProperties.set(
        mapOf(
            "models" to "",
            "apis" to "false",
            "supportingFiles" to "false"
        )
    )
}

// Generate DTOs from Admin API spec
tasks.register<org.openapitools.generator.gradle.plugin.tasks.GenerateTask>("generateAdminApi") {
    generatorName.set("kotlin")
    inputSpec.set("$rootDir/../sunrei-api/admin-api-spec.yaml")
    outputDir.set("$buildDir/generated-admin")
    apiPackage.set("com.sunrei.generated.api.admin")
    modelPackage.set("com.sunrei.generated.dto.admin")
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

    // Only generate models, not API clients
    globalProperties.set(
        mapOf(
            "models" to "",
            "apis" to "false",
            "supportingFiles" to "false"
        )
    )
}

// Create custom task with desired name
tasks.register("generateProtocols") {
    dependsOn("generateAppApi", "generateAdminApi")
    description = "Generate DTOs from OpenAPI specifications"
    group = "code generation"
}

// Configure Java version
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
        vendor.set(JvmVendorSpec.AMAZON)
    }
}

// Add generated sources to the main source set
kotlin {
    jvmToolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
        vendor.set(JvmVendorSpec.AMAZON)
    }

    sourceSets {
        main {
            kotlin.srcDir("$buildDir/generated-app/src/main/kotlin")
            kotlin.srcDir("$buildDir/generated-admin/src/main/kotlin")
        }
    }
}

// Make sure code generation runs before compilation
tasks.compileKotlin {
    dependsOn(tasks.named("generateProtocols"))
}

// Clean generated sources when cleaning
tasks.clean {
    delete("$buildDir/generated-app")
    delete("$buildDir/generated-admin")
}

// Flyway configuration
flyway {
    // Default configuration for local development
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

// Custom task for syncing database
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

// Task to show migration info
tasks.register("showMigrations") {
    group = "database"
    description = "Show current migration status"
    dependsOn("flywayInfo")
}

// Task to validate migrations
tasks.register("validateMigrations") {
    group = "database"
    description = "Validate applied migrations against available ones"
    dependsOn("flywayValidate")
}
