package com.sunrei

import com.sunrei.auth.routes.authRoutes
import com.sunrei.auth.service.AuthService
import com.sunrei.routes.app.appRoutes
import com.sunrei.routes.admin.adminRoutes
import com.sunrei.service.S3Service
import io.ktor.server.application.Application
import io.ktor.server.routing.routing

fun Application.configureRouting(s3Service: S3Service) {
    val authService = AuthService(environment.config)

    routing {
        // Auth endpoints (public)
        authRoutes(authService)

        // Public API endpoints (read-only)
        appRoutes()

        // Admin API endpoints (CRUD with auth)
        adminRoutes(s3Service)
    }
}
