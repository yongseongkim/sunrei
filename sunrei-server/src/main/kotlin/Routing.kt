package com.sunrei

import com.sunrei.auth.routes.authRoutes
import com.sunrei.routes.app.appRoutes
import com.sunrei.routes.admin.adminRoutes
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.routing.routing

fun Application.configureRouting() {
    routing {
        authRoutes()

        appRoutes()

        authenticate("admin-auth") {
            adminRoutes()
        }
    }
}
