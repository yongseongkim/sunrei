package com.sunrei.routes.admin

import com.sunrei.di.injectSunreiService
import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.service.ConflictException
import com.sunrei.service.SunreiService
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
    route("/sunreis") {
        get {
            val sunreiService: SunreiService = call.injectSunreiService()
            val nextToken = call.request.queryParameters["nextToken"]
            val size = call.request.queryParameters["size"]?.toIntOrNull() ?: 20
            val keyword = call.request.queryParameters["keyword"]

            // Validate size
            val validatedSize = when {
                size < 1 -> 1
                size > 100 -> 100
                else -> size
            }

            val result = sunreiService.listByKeyword(
                nextToken = nextToken,
                size = validatedSize,
                keyword = keyword
            )

            call.respond(result)
        }

        get("/{id}") {
            val sunreiService: SunreiService = call.injectSunreiService()
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@get
            }

            val sunrei = sunreiService.getById(id)

            if (sunrei != null) {
                call.respond(sunrei.toDTO())
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
            }
        }

        post {
            val sunreiService: SunreiService = call.injectSunreiService()
            try {
                val request = call.receive<CreateSunreiRequest>()
                val created = sunreiService.create(request)
                call.respond(HttpStatusCode.Created, created.toDTO())
            } catch (e: ConflictException) {
                call.respond(HttpStatusCode.Conflict, mapOf("error" to e.message, "existingId" to e.existingId))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        put("/{id}") {
            val sunreiService: SunreiService = call.injectSunreiService()
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@put
            }

            try {
                val request = call.receive<UpdateSunreiRequest>()
                val updated = sunreiService.update(id, request)

                if (updated != null) {
                    call.respond(updated.toDTO())
                } else {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        delete("/{id}") {
            val sunreiService: SunreiService = call.injectSunreiService()
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@delete
            }

            val deleted = sunreiService.delete(id)

            if (deleted) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
            }
        }
    }
}
