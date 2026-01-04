package com.sunrei

import com.sunrei.auth.provider.OAuthProviderFactory
import com.sunrei.config.DatabaseConfig
import com.sunrei.plugins.configureAuthentication
import com.sunrei.config.JwtConfig
import com.sunrei.di.configureDI
import com.typesafe.config.ConfigFactory
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
import io.ktor.server.plugins.di.DI
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

    // Initialize OAuth providers
    OAuthProviderFactory.initialize(config)

    // Install DI plugin and configure dependencies
    install(DI)
    configureDI()

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

    // Configure authentication
    configureAuthentication(config)

    // Configure routes
    configureRouting()
}
