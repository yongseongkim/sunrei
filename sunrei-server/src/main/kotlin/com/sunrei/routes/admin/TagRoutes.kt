package com.sunrei.routes.admin

import com.sunrei.di.injectTagService
import com.sunrei.generated.dto.admin.CreateTagRequest
import com.sunrei.generated.dto.admin.SpotSummaryDTO
import com.sunrei.generated.dto.admin.TagWithSpots
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
    route("/tags") {
        get {
            val tagService: TagService = call.injectTagService()
            val nextToken = call.request.queryParameters["nextToken"]
            val size = call.request.queryParameters["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20

            call.respond(tagService.list(nextToken = nextToken, size = size))
        }

        get("/search") {
            val tagService: TagService = call.injectTagService()
            val q = call.request.queryParameters["q"] ?: ""
            call.respond(tagService.search(q).map { it.toDTO() })
        }

        get("/{id}") {
            val tagService: TagService = call.injectTagService()
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            val data = tagService.getWithSpots(id)
            if (data == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag not found"))
                return@get
            }

            call.respond(
                TagWithSpots(
                    id = data.tag.id,
                    labelEn = data.tag.labelEn,
                    labelKo = data.tag.labelKo,
                    description = data.tag.description,
                    spots = data.spots.map { spot ->
                        SpotSummaryDTO(
                            id = spot.id,
                            title = spot.title,
                            sunreiId = spot.sunreiId,
                            sunreiTitle = spot.sunreiTitle
                        )
                    }
                )
            )
        }

        post {
            val tagService: TagService = call.injectTagService()
            try {
                val request = call.receive<CreateTagRequest>()
                val created = tagService.create(
                    labelEn = request.labelEn,
                    labelKo = request.labelKo,
                    description = request.description
                )
                call.respond(HttpStatusCode.Created, created.toDTO())
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        put("/{id}") {
            val tagService: TagService = call.injectTagService()
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            try {
                val request = call.receive<UpdateTagRequest>()
                val updated = tagService.update(
                    id = id,
                    labelEn = request.labelEn,
                    labelKo = request.labelKo,
                    description = request.description
                )
                if (updated != null) call.respond(updated.toDTO())
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag not found"))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        delete("/{id}") {
            val tagService: TagService = call.injectTagService()
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            val deleted = tagService.delete(id)
            if (deleted) call.respond(HttpStatusCode.NoContent)
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag not found"))
        }

        // Detach a spot from a tag.
        delete("/{id}/spots/{spotId}") {
            val tagService: TagService = call.injectTagService()
            val tagId = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing tag id parameter"))
            val spotId = call.parameters["spotId"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing spot id parameter"))

            val detached = tagService.detach(tagId, spotId)
            if (detached) call.respond(HttpStatusCode.NoContent)
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Tag-spot association not found"))
        }
    }
}
