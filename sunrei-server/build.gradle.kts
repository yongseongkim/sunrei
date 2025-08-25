plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
    id("org.openapi.generator") version "7.2.0"
}

group = "com.sunrei"
version = "1.0.0"

application {
    mainClass = "io.ktor.server.netty.EngineMain"
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
    
    // Serialization
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)
    
    // Utilities
    implementation(libs.ulid.creator)
    
    // Logging
    implementation(libs.logback.classic)
    
    // Testing
    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.kotlin.test.junit)
}

// OpenAPI Generator configuration
openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set("$rootDir/../sunrei-api/openapi.yaml")
    outputDir.set("$buildDir/generated")
    apiPackage.set("com.sunrei.generated.api")
    modelPackage.set("com.sunrei.generated.dto")
    configOptions.set(mapOf(
        "dateLibrary" to "kotlinx-datetime",
        "serializationLibrary" to "kotlinx_serialization",
        "enumPropertyNaming" to "UPPERCASE",
        "collectionType" to "list"
    ))
    generateApiDocumentation.set(false)
    generateModelDocumentation.set(false)
    generateApiTests.set(false)
    generateModelTests.set(false)
    
    // Only generate models, not API clients
    globalProperties.set(mapOf(
        "models" to "",
        "apis" to "false",
        "supportingFiles" to "false"
    ))
}

// Create custom task with desired name
tasks.register("generateProtocols") {
    dependsOn(tasks.openApiGenerate)
    description = "Generate DTOs from OpenAPI specification"
    group = "code generation"
}

// Add generated sources to the main source set
kotlin {
    sourceSets {
        main {
            kotlin.srcDir("$buildDir/generated/src/main/kotlin")
        }
    }
}

// Make sure code generation runs before compilation
tasks.compileKotlin {
    dependsOn(tasks.named("generateProtocols"))
}

// Clean generated sources when cleaning
tasks.clean {
    delete("$buildDir/generated")
}
