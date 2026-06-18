package com.sunrei.routes.admin

import com.sunrei.di.injectPlaceService
import com.sunrei.service.PlaceService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
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
    }
}
