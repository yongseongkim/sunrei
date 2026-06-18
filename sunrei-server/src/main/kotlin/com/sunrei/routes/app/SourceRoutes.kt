package com.sunrei.routes.app

import com.sunrei.di.injectSourceService
import com.sunrei.generated.dto.app.GetSourceResult
import com.sunrei.generated.dto.app.ListSourcesResult
import com.sunrei.service.SourceService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.appSourceRoutes() {
    route("/sources") {
        get {
            val sourceService: SourceService = call.injectSourceService()
            val q = call.request.queryParameters["q"]
            val sources = sourceService.listPublic(q)
            call.respond(ListSourcesResult(sources = sources))
        }

        get("/{id}") {
            val sourceService: SourceService = call.injectSourceService()
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id"))

            val detail = sourceService.getPublicDetail(id)
            if (detail == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Source not found"))
            } else {
                call.respond(GetSourceResult(source = detail.source, sunreis = detail.sunreis, places = null))
            }
        }
    }
}
