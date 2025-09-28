package com.sunrei.routes.app

import com.sunrei.service.SunreiSpotService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.sunreiSpotRoutes() {
    val sunreiSpotService = SunreiSpotService()

    route("/sunrei-spots") {
        get("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@get
            }

            val sunreiSpot = sunreiSpotService.findOne(id)

            if (sunreiSpot == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "SunreiSpot not found"))
            } else {
                call.respond(sunreiSpot)
            }
        }
    }
}