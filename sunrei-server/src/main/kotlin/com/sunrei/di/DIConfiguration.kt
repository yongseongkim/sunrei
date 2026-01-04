package com.sunrei.di

import com.sunrei.auth.service.AuthRepository
import com.sunrei.auth.service.AuthService
import com.sunrei.auth.service.IAuthRepository
import com.sunrei.auth.service.IAuthService
import com.sunrei.service.PlaceService
import com.sunrei.service.S3Config
import com.sunrei.service.S3Service
import com.sunrei.service.SunreiService
import com.sunrei.service.SunreiSpotService
import com.sunrei.service.TagService
import com.sunrei.service.UserService
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.config.ApplicationConfig
import io.ktor.server.plugins.di.DI
import io.ktor.server.plugins.di.dependencies

// Simple service locator for dependency injection
object ServiceLocator {
    lateinit var httpClient: Lazy<HttpClient>
    lateinit var s3Config: S3Config
    lateinit var s3Service: S3Service
    lateinit var userService: UserService
    lateinit var placeService: PlaceService
    lateinit var tagService: TagService
    lateinit var sunreiSpotService: SunreiSpotService
    lateinit var sunreiService: SunreiService
    lateinit var authRepository: IAuthRepository
    lateinit var authService: IAuthService
}

fun Application.configureDI() {
    val config = environment.config

    // First, install the DI plugin (if not already installed)
    // Then configure dependencies
    dependencies {
        // Create S3Config
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

        // Create leaf services
        val placeService = PlaceService()
        val tagService = TagService()
        val userService = UserService()
        val authRepository = AuthRepository()

        // Create HttpClient with lazy initialization
        val httpClientLazy = lazy {
            HttpClient(CIO) {
                install(ContentNegotiation) {
                    json()
                }
            }
        }

        // Create S3Service
        val s3Service = S3Service(httpClientLazy.value, s3Config)

        // Create SunreiSpotService (depends on PlaceService)
        val sunreiSpotService = SunreiSpotService(placeService)

        // Create SunreiService (depends on SunreiSpotService and PlaceService)
        val sunreiService = SunreiService(sunreiSpotService, placeService)

        // Create AuthService (depends on IAuthRepository)
        val authService = AuthService(config, authRepository)

        // Store all services in ServiceLocator
        ServiceLocator.httpClient = httpClientLazy
        ServiceLocator.s3Config = s3Config
        ServiceLocator.s3Service = s3Service
        ServiceLocator.userService = userService
        ServiceLocator.placeService = placeService
        ServiceLocator.tagService = tagService
        ServiceLocator.sunreiSpotService = sunreiSpotService
        ServiceLocator.sunreiService = sunreiService
        ServiceLocator.authRepository = authRepository
        ServiceLocator.authService = authService
    }
}
