package com.sunrei.routes.app

import com.sunrei.di.injectSunreiService
import com.sunrei.generated.dto.app.GetSunreiResult
import com.sunrei.routes.app.converter.toDTO
import com.sunrei.service.SunreiService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.sunreiRoutes() {
    route("/sunreis") {
        get("/{id}") {
            val sunreiService: SunreiService = call.injectSunreiService()
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id"))

            // Public: only published sunreis are visible.
            val sunrei = sunreiService.getPublishedWithSpots(id)
            if (sunrei == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
            } else {
                call.respond(GetSunreiResult(sunrei = sunrei.toDTO()))
            }
        }
    }
}
