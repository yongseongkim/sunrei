package com.sunrei.routes.admin

import com.sunrei.service.S3Service
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respondRedirect
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.adminRoutes(s3Service: S3Service) {
    route("/admin") {
        // Redirect root admin path to Sunrei list
        get {
            call.respondRedirect("/admin/sunreis", permanent = false)
        }

        adminSunreiRoutes()
        imageRoutes(s3Service)
    }
}