package com.sunrei.routes

import com.sunrei.service.AdminSunreiService
import com.sunrei.service.S3Service
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.adminRoutes(s3Service: S3Service) {
    val adminSunreiService = AdminSunreiService()

    imageRoutes(s3Service)

    route("/admin") {
        route("/sunreis") {
            get {
                val nextToken = call.request.queryParameters["nextToken"]
                val size = call.request.queryParameters["size"]?.toIntOrNull() ?: 20
                val search = call.request.queryParameters["search"]

                // Validate size
                val validatedSize = when {
                    size < 1 -> 1
                    size > 100 -> 100
                    else -> size
                }

                val result = adminSunreiService.list(
                    nextToken = nextToken,
                    size = validatedSize,
                    search = search
                )

                call.respond(result)
            }
            
            get("/{id}") {
                val id = call.parameters["id"] ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                    return@get
                }

                val sunrei = adminSunreiService.findOne(id)

                if (sunrei != null) {
                    call.respond(sunrei)
                } else {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
                }
            }
        }
    }
}