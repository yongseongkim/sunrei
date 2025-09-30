package com.sunrei.routes.app

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
    val sunreiService = SunreiService()

    route("/sunreis") {
        get {
            val polygon = call.request.queryParameters["polygon"]

            val sunreis = if (polygon != null) {
                try {
                    sunreiService.listByPolygon(polygon)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid polygon format"))
                    return@get
                }
            } else {
                sunreiService.list()
            }

            val result = ListSunreiResult(
                sunreis = sunreis.map { it.toDTO() },
                totalCount = sunreis.size
            )
            call.respond(result)
        }

        get("/{id}") {
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