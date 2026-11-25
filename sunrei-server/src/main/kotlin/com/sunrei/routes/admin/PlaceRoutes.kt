package com.sunrei.routes.admin

import com.sunrei.di.injectPlaceService
import com.sunrei.generated.dto.admin.UpdatePlaceRequest
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.service.PlaceService
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.decodeFromJsonElement
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.route

fun Route.adminPlaceRoutes() {
    route("/places") {
        get {
            val placeService: PlaceService = call.injectPlaceService()
            val q = call.request.queryParameters["q"]
            val nextToken = call.request.queryParameters["nextToken"]
            val size = call.request.queryParameters["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20

            val result = placeService.list(q = q, nextToken = nextToken, size = size)
            call.respond(HttpStatusCode.OK, result)
        }

        patch("/{id}") {
            val placeService: PlaceService = call.injectPlaceService()
            val id = call.parameters["id"]
                ?: return@patch call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))

            call.handleErrors {
                val body = call.receive<JsonObject>()
                require(!body.containsKey("category") || body["category"] != JsonNull) { "category cannot be null" }
                val request = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<UpdatePlaceRequest>(body)
                val updated = placeService.update(id, request)
                if (updated != null) call.respond(updated.toDTO())
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Place not found"))
            }
        }
    }
}
