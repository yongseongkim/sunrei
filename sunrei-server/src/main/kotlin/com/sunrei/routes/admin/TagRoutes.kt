package com.sunrei.routes.admin

import com.sunrei.generated.dto.admin.CreateTagRequest
import com.sunrei.generated.dto.admin.UpdateTagRequest
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.service.TagService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.adminTagRoutes() {
    val tagService = TagService()

    route("/tags") {
        // List all tags with pagination
        get {
            val nextToken = call.request.queryParameters["nextToken"]
            val size = call.request.queryParameters["size"]?.toIntOrNull() ?: 20

            // Validate size
            val validatedSize = when {
                size < 1 -> 1
                size > 100 -> 100
                else -> size
            }

            val result = tagService.list(
                nextToken = nextToken,
                size = validatedSize
            )

            call.respond(result)
        }

        // Search tags by name
        get("/search") {
            val query = call.request.queryParameters["q"] ?: ""
            val tags = tagService.searchByName(query).map { it.toDTO() }
            call.respond(tags)
        }

        // Get tag with associated Sunreis
        get("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@get
            }

            val data = tagService.getWithSunreis(id)
            if (data == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag not found"))
                return@get
            }

            val response = com.sunrei.generated.dto.admin.TagWithSunreis(
                id = data.tag.id,
                name = data.tag.name,
                description = data.tag.description,
                sunreis = data.sunreis.map { sunrei ->
                    com.sunrei.generated.dto.admin.SunreiBasicInfo(
                        id = sunrei.id,
                        title = sunrei.title
                    )
                }
            )

            call.respond(response)
        }

        // Create new tag
        post {
            try {
                val request = call.receive<CreateTagRequest>()
                val createdTag = tagService.create(
                    name = request.name,
                    description = request.description
                )
                call.respond(HttpStatusCode.Created, createdTag.toDTO())
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        // Update tag
        put("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@put
            }

            try {
                val request = call.receive<UpdateTagRequest>()
                val updatedTag = tagService.update(
                    id = id,
                    name = request.name,
                    description = request.description
                )

                if (updatedTag != null) {
                    call.respond(updatedTag.toDTO())
                } else {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag not found"))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        // Delete tag
        delete("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@delete
            }

            // TODO: Implement tag deletion logic
            call.respond(HttpStatusCode.NoContent)
        }

        // Remove Sunrei from tag
        delete("/{id}/sunreis/{sunreiId}") {
            val tagId = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing tag id parameter"))
                return@delete
            }
            val sunreiId = call.parameters["sunreiId"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing sunrei id parameter"))
                return@delete
            }

            val removed = tagService.removeSunreiFromTag(tagId, sunreiId)
            if (removed) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag-Sunrei association not found"))
            }
        }
    }
}
