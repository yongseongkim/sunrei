package com.sunrei.service

import com.sunrei.generated.dto.ImageDTO
import com.sunrei.generated.dto.PlaceDTO
import com.sunrei.generated.dto.SunreiDTO
import com.sunrei.generated.dto.SunreiSpotDTO
import com.sunrei.generated.dto.TagDTO
import com.sunrei.model.Places
import com.sunrei.model.SunreiSpots
import com.sunrei.model.SunreiTags
import com.sunrei.model.Sunreis
import com.sunrei.model.Tags
import com.sunrei.utils.Point
import com.sunrei.utils.isPointInPolygon
import com.sunrei.utils.parseWKTPolygon
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction

class SunreiService {

    fun findAll(): List<SunreiDTO> = transaction {
        val sunreis = Sunreis.selectAll()
            .orderBy(Sunreis.createdAt to SortOrder.DESC)
            .map { row ->
                val sunreiId = row[Sunreis.id]
                val spots = fetchSpotsForSunrei(sunreiId)
                val tags = fetchTagsForSunrei(sunreiId)

                SunreiDTO(
                    id = sunreiId,
                    title = row[Sunreis.title],
                    description = row[Sunreis.description],
                    link = row[Sunreis.link],
                    images = row[Sunreis.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
                    spots = spots,
                    tags = tags
                )
            }
        sunreis
    }

    fun findOne(id: String): SunreiDTO? = transaction {
        Sunreis.select { Sunreis.id eq id }
            .firstOrNull()?.let { row ->
                val sunreiId = row[Sunreis.id]
                val spots = fetchSpotsForSunrei(sunreiId)
                val tags = fetchTagsForSunrei(sunreiId)

                SunreiDTO(
                    id = sunreiId,
                    title = row[Sunreis.title],
                    description = row[Sunreis.description],
                    link = row[Sunreis.link],
                    images = row[Sunreis.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
                    spots = spots,
                    tags = tags
                )
            }
    }

    fun findByPolygon(polygonWKT: String): List<SunreiDTO> {
        val polygon = parseWKTPolygon(polygonWKT)

        return transaction {
            val allSunreis = Sunreis.selectAll()
                .orderBy(Sunreis.createdAt to SortOrder.DESC)
                .toList()

            allSunreis.mapNotNull { row ->
                val sunreiId = row[Sunreis.id]
                val spots = fetchSpotsForSunrei(sunreiId)

                // Check if any spot's place is within the polygon
                val hasSpotInPolygon = spots.any { spot ->
                    spot.places?.any { place ->
                        if (place.latitude == null || place.longitude == null) {
                            return@any false
                        }
                        val point = Point(
                            latitude = place.latitude,
                            longitude = place.longitude
                        )
                        isPointInPolygon(point, polygon)
                    } ?: false
                }

                if (hasSpotInPolygon) {
                    val tags = fetchTagsForSunrei(sunreiId)

                    SunreiDTO(
                        id = sunreiId,
                        title = row[Sunreis.title],
                        description = row[Sunreis.description],
                        link = row[Sunreis.link],
                        images = row[Sunreis.images].map { img ->
                            ImageDTO(
                                url = img.url,
                                width = img.width,
                                height = img.height,
                            )
                        },
                        spots = spots,
                        tags = tags
                    )
                } else {
                    null
                }
            }
        }
    }

    private fun fetchSpotsForSunrei(sunreiId: String): List<SunreiSpotDTO> {
        return (SunreiSpots innerJoin Places)
            .select { SunreiSpots.sunreiId eq sunreiId }
            .map { row ->
                SunreiSpotDTO(
                    id = row[SunreiSpots.id],
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
                    places = listOf(
                        PlaceDTO(
                            id = row[Places.id],
                            name = row[Places.name],
                            address = row[Places.address],
                            latitude = row[Places.latitude],
                            longitude = row[Places.longitude]
                        )
                    )
                )
            }
    }

    private fun fetchTagsForSunrei(sunreiId: String): List<TagDTO> {
        return (SunreiTags innerJoin Tags)
            .select { SunreiTags.sunreiId eq sunreiId }
            .map { row ->
                TagDTO(
                    id = row[Tags.id],
                    name = row[Tags.name],
                    description = row[Tags.description]
                )
            }
    }
}