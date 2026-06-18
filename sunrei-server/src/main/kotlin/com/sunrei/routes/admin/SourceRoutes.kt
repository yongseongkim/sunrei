package com.sunrei.routes.admin

import com.sunrei.di.injectSourceService
import com.sunrei.generated.dto.admin.CreateSourceRequest
import com.sunrei.generated.dto.admin.UpdateSourceRequest
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.service.SourceService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.adminSourceRoutes() {
    route("/sources") {
        get {
            val sourceService: SourceService = call.injectSourceService()
            val q = call.request.queryParameters["q"]
            val nextToken = call.request.queryParameters["nextToken"]
            val size = call.request.queryParameters["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20

            val result = sourceService.list(q = q, nextToken = nextToken, size = size)
            call.respond(result)
        }

        get("/search") {
            val sourceService: SourceService = call.injectSourceService()
            val q = call.request.queryParameters["q"] ?: ""
            call.respond(sourceService.search(q).map { it.toDTO() })
        }

        get("/{id}") {
            val sourceService: SourceService = call.injectSourceService()
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            val source = sourceService.getById(id)
            if (source != null) call.respond(source.toDTO())
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Source not found"))
        }

        post {
            val sourceService: SourceService = call.injectSourceService()
            try {
                val request = call.receive<CreateSourceRequest>()
                val created = sourceService.create(request)
                call.respond(HttpStatusCode.Created, created.toDTO())
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        put("/{id}") {
            val sourceService: SourceService = call.injectSourceService()
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            try {
                val request = call.receive<UpdateSourceRequest>()
                val updated = sourceService.update(id, request)
                if (updated != null) call.respond(updated.toDTO())
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Source not found"))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
            }
        }

        delete("/{id}") {
            val sourceService: SourceService = call.injectSourceService()
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            val deleted = sourceService.delete(id)
            if (deleted) call.respond(HttpStatusCode.NoContent)
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Source not found"))
        }
    }
}
