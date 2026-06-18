package com.sunrei.routes.app

import com.sunrei.di.injectSearchService
import com.sunrei.service.SearchService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.searchRoutes() {
    route("/search") {
        get {
            val searchService: SearchService = call.injectSearchService()
            val q = call.request.queryParameters["q"]
            if (q.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "q is required"))
                return@get
            }
            val centerLat = call.request.queryParameters["centerLat"]?.toDoubleOrNull()
            val centerLng = call.request.queryParameters["centerLng"]?.toDoubleOrNull()
            call.respond(searchService.search(q, centerLat, centerLng))
        }
    }
}
