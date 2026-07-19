package com.sunrei.routes.app

import com.sunrei.di.injectPlaceService
import com.sunrei.di.injectSunreiSpotService
import com.sunrei.generated.dto.app.GetPlaceResult
import com.sunrei.routes.app.converter.toDTO
import com.sunrei.service.PlaceService
import com.sunrei.service.SunreiSpotService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.placeRoutes() {
    route("/places") {
        get("/{id}") {
            val placeService: PlaceService = call.injectPlaceService()
            val spotService: SunreiSpotService = call.injectSunreiSpotService()
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id"))

            val place = placeService.getById(id)
            if (place == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Place not found"))
                return@get
            }

            val feed = spotService.feedByPlaces(listOf(place to null)).firstOrNull()
            val mentions = feed?.mentions?.map { it.toDTO() } ?: emptyList()
            val spots = spotService.listPublishedSpotsByPlace(id).map { it.toDTO() }

            call.respond(
                GetPlaceResult(
                    place = place.toDTO(),
                    mentions = mentions,
                    spots = spots
                )
            )
        }
    }
}
