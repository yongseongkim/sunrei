package com.sunrei

import com.sunrei.routes.adminRoutes
import com.sunrei.routes.sunreiRoutes
import com.sunrei.routes.sunreiSpotRoutes
import com.sunrei.routes.tagRoutes
import com.sunrei.service.S3Service
import io.ktor.server.application.Application
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.configureRouting(s3Service: S3Service) {
    routing {
        // Public API endpoints (read-only)
        route("/api") {
            sunreiRoutes()
            sunreiSpotRoutes()
            tagRoutes()
        }

        // Admin API endpoints (CRUD with auth)
        adminRoutes(s3Service)
    }
}
