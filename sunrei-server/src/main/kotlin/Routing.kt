package com.sunrei

import com.sunrei.auth.routes.authRoutes
import com.sunrei.auth.service.IAuthService
import com.sunrei.di.injectAuthService
import com.sunrei.routes.app.appRoutes
import com.sunrei.routes.admin.adminRoutes
import io.ktor.server.application.Application
import io.ktor.server.routing.routing

fun Application.configureRouting() {
    // Use the inject extension function to get dependencies
    val authService: IAuthService = injectAuthService()

    routing {
        // Auth endpoints (public)
        authRoutes(authService)

        // Public API endpoints (read-only)
        appRoutes()

        // Admin API endpoints (CRUD with auth)
        adminRoutes()
    }
}
