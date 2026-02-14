package com.sunrei

import com.sunrei.auth.routes.authRoutes
import com.sunrei.routes.app.appRoutes
import com.sunrei.routes.admin.adminRoutes
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.routing.routing

fun Application.configureRouting() {
    routing {
        // Auth endpoints (public)
        authRoutes()

        // Public API endpoints (read-only)
        appRoutes()

        // Admin API endpoints (CRUD with auth)
        authenticate("admin-auth") {
            adminRoutes()
        }
    }
}
