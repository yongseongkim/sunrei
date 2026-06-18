package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.Sources
import com.sunrei.database.SunreiSpots
import com.sunrei.database.SunreiSpotTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.model.MultiSizeImage
import com.sunrei.model.Place
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag
import kotlinx.datetime.Instant
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.innerJoin
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction

class SunreiSpotService {

    /**
     * Build PlaceCards for a set of places (each already carrying its distance to the
     * map center). Two queries: spots joined to published sunreis + sources, then tags
     * per spot. Mentions collapse multiple spots of the same video at one place into a
     * single representative row (first spot with non-empty context).
     */
    fun feedByPlaces(placesWithDistance: List<Pair<Place, Double?>>): List<PlaceFeedItem> {
        if (placesWithDistance.isEmpty()) return emptyList()

        val placeIds = placesWithDistance.map { it.first.id }
        val placeById = placesWithDistance.associate { it.first.id to it.first }
        val distanceById = placesWithDistance.associate { it.first.id to it.second }

        return transaction {
            // Q1: published spots at these places, with their sunrei + source.
            val spotRows = (SunreiSpots innerJoin Sunreis innerJoin Sources)
                .select {
                    (SunreiSpots.placeId inList placeIds) and
                        (SunreiSpots.deletedAt.isNull()) and
                        (Sunreis.deletedAt.isNull()) and
                        (Sunreis.publishedAt.isNotNull())
                }
                .toList()

            val spotIds = spotRows.map { it[SunreiSpots.id] }.distinct()

            // Q2: tags per spot.
            val tagsBySpot: Map<String, List<Tag>> =
                if (spotIds.isEmpty()) emptyMap()
                else (SunreiSpotTags innerJoin Tags)
                    .select { SunreiSpotTags.sunreiSpotId inList spotIds }
                    .groupBy(
                        keySelector = { it[SunreiSpotTags.sunreiSpotId] },
                        valueTransform = {
                            Tag(
                                id = it[Tags.id],
                                labelEn = it[Tags.labelEn],
                                labelKo = it[Tags.labelKo],
                                description = it[Tags.description]
                            )
                        }
                    )

            // Group spots under (placeId, sunreiId) and pick a representative.
            data class SpotRow(
                val spotId: String,
                val placeId: String,
                val sunreiId: String,
                val sunreiTitle: String,
                val sunreiLink: String?,
                val sunreiPublishedAt: Instant,
                val source: com.sunrei.model.Source,
                val spotTitle: String,
                val context: String?,
                val youtubeLink: String?,
                val sunreiImages: List<MultiSizeImage>,
                val tags: List<Tag>
            )

            val rows = spotRows.map {
                val spotId = it[SunreiSpots.id]
                SpotRow(
                    spotId = spotId,
                    placeId = it[SunreiSpots.placeId],
                    sunreiId = it[Sunreis.id],
                    sunreiTitle = it[Sunreis.title],
                    sunreiLink = it[Sunreis.link],
                    sunreiPublishedAt = it[Sunreis.publishedAt] ?: Instant.fromEpochSeconds(0),
                    source = com.sunrei.model.Source(
                        id = it[Sources.id],
                        type = com.sunrei.model.SourceType.valueOf(it[Sources.type]),
                        name = it[Sources.name],
                        nameEn = it[Sources.nameEn],
                        nameKo = it[Sources.nameKo],
                        synopsis = it[Sources.synopsis],
                        externalUrl = it[Sources.externalUrl],
                        posterImage = it[Sources.posterImage],
                        deletedAt = it[Sources.deletedAt],
                        createdAt = it[Sources.createdAt],
                        updatedAt = it[Sources.updatedAt]
                    ),
                    spotTitle = it[SunreiSpots.title],
                    context = it[SunreiSpots.context],
                    youtubeLink = it[SunreiSpots.youtubeLink],
                    sunreiImages = it[Sunreis.images],
                    tags = tagsBySpot[spotId] ?: emptyList()
                )
            }

            // Build place -> items, preserving only places that have published spots.
            val byPlace: Map<String, List<SpotRow>> = rows.groupBy { it.placeId }
            val orderedPlaceIds = placesWithDistance.map { it.first.id }.filter { it in byPlace }

            orderedPlaceIds.mapNotNull { placeId ->
                val placeRows = byPlace[placeId] ?: return@mapNotNull null
                val place = placeById[placeId] ?: return@mapNotNull null

                // Collapse spots by sunrei (one mention per video).
                val bySunrei: Map<String, List<SpotRow>> = placeRows.groupBy { it.sunreiId }
                val mentions = bySunrei.values.map { spotGroup ->
                    val rep = spotGroup.firstOrNull { !it.context.isNullOrBlank() } ?: spotGroup.first()
                    PlaceMention(
                        source = rep.source,
                        sunreiId = rep.sunreiId,
                        sunreiTitle = rep.sunreiTitle,
                        spotId = rep.spotId,
                        context = rep.context,
                        sunreiLink = rep.sunreiLink,
                        youtubeLink = rep.youtubeLink,
                        images = rep.sunreiImages,
                        tags = rep.tags
                    )
                }.sortedWith(
                    compareBy<PlaceMention> { it.source.name }
                        .thenBy { it.sunreiTitle }
                )

                val tags = placeRows.flatMap { it.tags }.distinctBy { it.id }
                PlaceFeedItem(
                    place = place,
                    distanceMeters = distanceById[placeId],
                    mentions = mentions,
                    tags = tags,
                    sourceCount = placeRows.map { it.source.id }.distinct().size,
                    sunreiCount = placeRows.map { it.sunreiId }.distinct().size,
                    spotCount = placeRows.size
                )
            }
        }
    }

    /** Published spots for a single sunrei (video preview / detail). */
    fun listPublishedBySunrei(sunreiId: String): List<SunreiSpot> {
        // Delegates to SunreiService fetch; kept here for future direct use.
        return emptyList()
    }

    /** All published SunreiSpots at a place (place detail's spots[]). */
    fun listPublishedSpotsByPlace(placeId: String): List<SunreiSpot> = transaction {
        val rows = (SunreiSpots innerJoin Places innerJoin Sunreis)
            .select {
                (SunreiSpots.placeId eq placeId) and
                    (SunreiSpots.deletedAt.isNull()) and
                    (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull())
            }
            .toList()

        val spotIds = rows.map { it[SunreiSpots.id] }.distinct()
        val tagsBySpot: Map<String, List<Tag>> =
            if (spotIds.isEmpty()) emptyMap()
            else (SunreiSpotTags innerJoin Tags)
                .select { SunreiSpotTags.sunreiSpotId inList spotIds }
                .groupBy(
                    keySelector = { it[SunreiSpotTags.sunreiSpotId] },
                    valueTransform = {
                        Tag(
                            id = it[Tags.id],
                            labelEn = it[Tags.labelEn],
                            labelKo = it[Tags.labelKo],
                            description = it[Tags.description]
                        )
                    }
                )

        rows.map { row ->
            val spotId = row[SunreiSpots.id]
            SunreiSpot(
                id = spotId,
                sunreiId = row[SunreiSpots.sunreiId],
                title = row[SunreiSpots.title],
                description = row[SunreiSpots.description],
                context = row[SunreiSpots.context],
                youtubeLink = row[SunreiSpots.youtubeLink],
                images = row[SunreiSpots.images],
                place = row.toPlace(),
                tags = tagsBySpot[spotId] ?: emptyList()
            )
        }
    }
}
