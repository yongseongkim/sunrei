package com.sunrei.routes.app

import com.sunrei.database.SunreiTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.generated.dto.app.ListMapSpots
import com.sunrei.generated.dto.app.MapResult
import com.sunrei.model.Sunrei
import com.sunrei.model.Tag
import com.sunrei.routes.app.converter.toMapSpotDTO
import com.sunrei.routes.app.converter.toSunreiInfoDTO
import com.sunrei.service.SunreiSpotService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

fun Route.mapRoutes() {
    val sunreiSpotService = SunreiSpotService()

    route("/map") {
        get {
            val polygon = call.request.queryParameters["polygon"]

            if (polygon != null) {
                try {
                    val spots = sunreiSpotService.listInPolygon(polygon)
                    if (spots.isEmpty()) {
                        val result = MapResult(spots = emptyList())
                        call.respond(result)
                        return@get
                    }

                    val sunreiIds = spots.map { it.sunreiId }.distinct()

                    // Fetch Sunrei data and build SunreiInfoDTO map
                    val sunreiInfoMap = transaction {
                        // Fetch sunreis
                        val sunreiRows = Sunreis.select {
                            (Sunreis.id inList sunreiIds) and (Sunreis.deletedAt.isNull())
                        }.associateBy { it[Sunreis.id] }

                        // Fetch tags for all sunreis
                        val tagsMap = (SunreiTags innerJoin Tags)
                            .select { SunreiTags.sunreiId inList sunreiIds }
                            .map { row ->
                                val sunreiId = row[SunreiTags.sunreiId]
                                val tag = Tag(
                                    id = row[Tags.id],
                                    name = row[Tags.name],
                                    description = row[Tags.description]
                                )
                                sunreiId to tag
                            }
                            .groupBy({ it.first }, { it.second })

                        // Build SunreiInfoDTO map
                        sunreiRows.mapValues { (sunreiId, row) ->
                            val tags = tagsMap[sunreiId] ?: emptyList()
                            Sunrei(
                                id = row[Sunreis.id],
                                title = row[Sunreis.title],
                                description = row[Sunreis.description],
                                link = row[Sunreis.link],
                                images = row[Sunreis.images],
                                spots = emptyList(), // Not needed for SunreiInfoDTO
                                tags = tags,
                                createdAt = row[Sunreis.createdAt],
                                updatedAt = row[Sunreis.updatedAt]
                            ).toSunreiInfoDTO()
                        }
                    }

                    val mapSpots = spots.mapNotNull { spot ->
                        val sunreiInfo = sunreiInfoMap[spot.sunreiId]
                        sunreiInfo?.let { spot.toMapSpotDTO(it) }
                    }

                    val result = ListMapSpots(spots = mapSpots)
                    call.respond(result)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid polygon format"))
                    return@get
                }
            } else {
                // Return empty result when no polygon provided
                val result = MapResult(spots = emptyList())
                call.respond(result)
            }
        }
    }
}
