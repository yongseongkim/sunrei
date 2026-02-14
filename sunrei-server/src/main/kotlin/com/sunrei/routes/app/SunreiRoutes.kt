package com.sunrei.routes.app

import com.sunrei.di.injectSunreiService
import com.sunrei.generated.dto.app.GetSunreiResult
import com.sunrei.generated.dto.app.ListSunreiResult
import com.sunrei.routes.app.converter.toDTO
import com.sunrei.service.SunreiService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.sunreiRoutes() {
    route("/sunreis") {
        get {
            val sunreiService: SunreiService = call.injectSunreiService()
            val sunreis = sunreiService.list()
            val result = ListSunreiResult(
                sunreis = sunreis.map { it.toDTO() },
                totalCount = sunreis.size
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
                val result = GetSunreiResult(sunrei = sunrei.toDTO())
                call.respond(result)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Sunrei not found"))
            }
        }
    }
}
