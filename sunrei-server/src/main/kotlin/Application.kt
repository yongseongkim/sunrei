package com.sunrei

import com.sunrei.config.DatabaseConfig
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import kotlinx.serialization.json.Json
import org.slf4j.event.Level

fun main(args: Array<String>) {
    io.ktor.server.netty.EngineMain.main(args)
}

fun Application.module() {
    val config = environment.config
    val isDevelopment = config.propertyOrNull("ktor.deployment.environment")?.getString() == "development" ||
            config.propertyOrNull("ktor.deployment.watch")?.getList()?.isNotEmpty() == true

    // Initialize database
    DatabaseConfig.init(config)

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
    val dbHost = config.property("database.host").getString()
    val dbPort = config.property("database.port").getString()
    val dbName = config.property("database.name").getString()

    log.info("Starting Sunrei Server")
    log.info("Environment: ${if (isDevelopment) "development" else "production"}")
    log.info("Database: $dbHost:$dbPort/$dbName")

    // Configure routes
    configureRouting()
}
