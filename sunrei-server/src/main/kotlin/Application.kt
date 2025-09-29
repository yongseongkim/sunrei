package com.sunrei

import com.sunrei.config.DatabaseConfig
import com.sunrei.config.JwtConfig
import com.sunrei.service.S3Config
import com.sunrei.service.S3Service
import com.typesafe.config.ConfigFactory
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.config.HoconApplicationConfig
import io.ktor.server.engine.EngineConnectorBuilder
import io.ktor.server.engine.applicationEnvironment
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import kotlinx.serialization.json.Json
import org.slf4j.event.Level

fun main(args: Array<String>) {
    val env = System.getenv("KTOR_ENV") ?: "local"
    val appConfig = ConfigFactory.load("application-$env.conf")

    val server = embeddedServer(
        Netty,
        environment = applicationEnvironment {
            config = HoconApplicationConfig(appConfig)
        },
        configure = {
            connectors.add(
                EngineConnectorBuilder().apply {
                    host = appConfig.getString("ktor.deployment.host")
                    port = appConfig.getInt("ktor.deployment.port")
                }
            )
        },
        module = Application::module
    )
    server.start(wait = true)
}

fun Application.module() {
    val config = environment.config

    val isDevelopment = config.propertyOrNull("ktor.deployment.watch")?.getList()?.isNotEmpty() == true

    // Initialize database
    DatabaseConfig.init(config)

    // Initialize JWT configuration
    JwtConfig.init(config)

    // Initialize S3 service
    val s3Config = S3Config(
        region = config.property("aws.region").getString(),
        bucketName = config.property("aws.s3.bucket").getString(),
        accessKeyId = config.property("aws.accessKeyId").getString(),
        secretAccessKey = config.property("aws.secretAccessKey").getString(),
        publicUrl = config.propertyOrNull("aws.s3.publicUrl")?.getString()
            ?: "https://${
                config.propertyOrNull("aws.s3.bucket")?.getString() ?: "sunrei-images"
            }.s3.${config.propertyOrNull("aws.region")?.getString() ?: "ap-northeast-2"}.amazonaws.com"
    )

    val httpClient = HttpClient(CIO) {
        install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
            json()
        }
    }

    val s3Service = S3Service(httpClient, s3Config)

    // Configure serialization
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = isDevelopment
            isLenient = true
            ignoreUnknownKeys = true
        })
    }

    // Configure CORS
    install(CORS) {
        val allowedHosts = config.propertyOrNull("cors.allowedHosts")?.getString() ?: "*"

        if (allowedHosts == "*") {
            anyHost()
        } else {
            allowedHosts.split(",").forEach { host ->
                allowHost(host.trim(), schemes = listOf("http", "https"))
            }
        }

        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowCredentials = true
    }

    // Configure logging
    install(CallLogging) {
        level = when (config.propertyOrNull("logging.level")?.getString()) {
            "DEBUG" -> Level.DEBUG
            "INFO" -> Level.INFO
            "WARN" -> Level.WARN
            "ERROR" -> Level.ERROR
            else -> Level.INFO
        }
    }

    // Log startup information
    val appName = config.propertyOrNull("app.name")?.getString() ?: "Sunrei Server"
    val appVersion = config.propertyOrNull("app.version")?.getString() ?: "1.0.0"
    val dbHost = config.property("database.host").getString()
    val dbPort = config.property("database.port").getString()
    val dbName = config.property("database.name").getString()

    log.info("Starting $appName v$appVersion")
    log.info("Environment: ${if (isDevelopment) "development" else "production"}")
    log.info("Database: $dbHost:$dbPort/$dbName")

    // Configure routes
    configureRouting(s3Service)
}
