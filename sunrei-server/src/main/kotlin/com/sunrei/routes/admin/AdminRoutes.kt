package com.sunrei.routes.admin

import com.sunrei.service.S3Service
import io.ktor.server.routing.Route
import io.ktor.server.routing.route

fun Route.adminRoutes(s3Service: S3Service) {
    route("/admin") {
        adminSunreiRoutes()
        imageRoutes(s3Service)
    }
}