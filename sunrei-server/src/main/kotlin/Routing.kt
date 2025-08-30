package com.sunrei

import com.sunrei.routes.sunreiRoutes
import com.sunrei.routes.sunreiSpotRoutes
import com.sunrei.routes.tagRoutes
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        // Public API endpoints (read-only)
        route("/api") {
            sunreiRoutes()
            sunreiSpotRoutes()
            tagRoutes()
        }

        // Admin API endpoints (CRUD with auth)
        route("/admin") {
            // TODO: Add authentication middleware
            // TODO: Add admin routes
        }
    }
}
