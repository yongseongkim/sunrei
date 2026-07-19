package com.sunrei.routes.app

import com.sunrei.di.injectPlaceService
import com.sunrei.di.injectSunreiSpotService
import com.sunrei.generated.dto.app.BoundsDTO
import com.sunrei.generated.dto.app.ListPlacesResult
import com.sunrei.routes.app.converter.toDTO
import com.sunrei.service.PlaceService
import com.sunrei.service.SunreiSpotService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.mapRoutes() {
    route("/map") {
        get {
            val placeService: PlaceService = call.injectPlaceService()
            val spotService: SunreiSpotService = call.injectSunreiSpotService()
            val p = call.request.queryParameters

            val centerLat = p["centerLat"]?.toDoubleOrNull()
            val centerLng = p["centerLng"]?.toDoubleOrNull()
            val sourceIdsParam = p["sourceIds"]
            val sourceIds = sourceIdsParam
                ?.split(",")
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
                ?: emptyList()

            val placesWithDistance = when {
                // Source mode wins: global, no viewport bound.
                sourceIds.isNotEmpty() ->
                    placeService.listBySourcesWithDistance(sourceIds, centerLat, centerLng)

                // Nearby mode: requires viewport bounds.
                else -> {
                    val swLat = p["swLat"]?.toDoubleOrNull()
                    val swLng = p["swLng"]?.toDoubleOrNull()
                    val neLat = p["neLat"]?.toDoubleOrNull()
                    val neLng = p["neLng"]?.toDoubleOrNull()
                    if (swLat == null || swLng == null || neLat == null || neLng == null) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("error" to "Requires sourceIds or viewport bounds (swLat,swLng,neLat,neLng)")
                        )
                        return@get
                    }
                    placeService.listInBoundsWithDistance(swLat, swLng, neLat, neLng, centerLat, centerLng)
                }
            }

            val feedItems = spotService.feedByPlaces(placesWithDistance)
            val cards = feedItems.map { it.toDTO() }

            // Optional source rail: distinct sources across all mentions.
            val sources = feedItems
                .flatMap { it.mentions }
                .map { it.source }
                .distinctBy { it.id }
                .map { it.toDTO() }

            val bounds = if (sourceIds.isEmpty()) {
                val swLat = p["swLat"]?.toDoubleOrNull()
                val swLng = p["swLng"]?.toDoubleOrNull()
                val neLat = p["neLat"]?.toDoubleOrNull()
                val neLng = p["neLng"]?.toDoubleOrNull()
                if (swLat != null && swLng != null && neLat != null && neLng != null) BoundsDTO(swLat.toFloat(), swLng.toFloat(), neLat.toFloat(), neLng.toFloat()) else null
            } else null

            call.respond(
                ListPlacesResult(
                    places = cards,
                    sources = sources.ifEmpty { null },
                    bounds = bounds
                )
            )
        }
    }
}
