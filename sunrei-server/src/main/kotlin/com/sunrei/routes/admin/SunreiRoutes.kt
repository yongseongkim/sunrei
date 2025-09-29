package com.sunrei.routes.admin

import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.service.AdminSunreiService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.adminSunreiRoutes() {
    val adminSunreiService = AdminSunreiService()

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

        post {
            try {
                val request = call.receive<CreateSunreiRequest>()
                val created = adminSunreiService.create(request)
                call.respond(HttpStatusCode.Created, created)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        put("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@put
            }

            try {
                val request = call.receive<UpdateSunreiRequest>()
                val updated = adminSunreiService.update(id, request)

                if (updated != null) {
                    call.respond(updated)
                } else {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        delete("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@delete
            }

            val deleted = adminSunreiService.delete(id)

            if (deleted) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
            }
        }
    }
}