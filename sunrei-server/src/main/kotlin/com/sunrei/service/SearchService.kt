package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.Sources
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.generated.dto.app.ImageDTO
import com.sunrei.generated.dto.app.MultiSizeImageDTO
import com.sunrei.generated.dto.app.PlaceDTO
import com.sunrei.generated.dto.app.PlaceSearchHitDTO
import com.sunrei.generated.dto.app.SearchResult
import com.sunrei.generated.dto.app.SourceDTO
import com.sunrei.generated.dto.app.SourceType as AppSourceType
import com.sunrei.generated.dto.app.SunreiSummaryDTO
import com.sunrei.model.Place
import com.sunrei.model.SourceType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

class SearchService {

    /** Unified search: database place hits, published source hits, published sunrei hits. */
    fun search(q: String, centerLat: Double?, centerLng: Double?): SearchResult = transaction {
        val term = "%${q.lowercase()}%"

        // ---- Places with published spots matching name/address ----
        val publishedPlaceIds = (SunreiSpots innerJoin Sunreis)
            .slice(SunreiSpots.placeId)
            .select {
                (SunreiSpots.deletedAt.isNull()) and (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull())
            }
            .map { it[SunreiSpots.placeId] }
            .distinct()

        val placeRows = if (publishedPlaceIds.isNotEmpty()) {
            Places.select {
                (Places.deletedAt.isNull()) and (Places.id inList publishedPlaceIds) and
                    ((Places.name.lowerCase() like term) or (Places.address.lowerCase() like term))
            }.limit(20).toList()
        } else emptyList()

        val placeHitIds = placeRows.map { it[Places.id] }
        val spotCountByPlace = countSpotsByPlace(placeHitIds)
        val sourceCountByPlace = countSourcesByPlace(placeHitIds)
        val distAlias = if (centerLat != null && centerLng != null)
            StDistanceMeters(Places.geom, centerLng, centerLat).alias("dist") else null

        val places = placeRows.map { row ->
            val id = row[Places.id]
            PlaceSearchHitDTO(
                place = row.toPlace().toPlaceDTO(),
                mentionCount = spotCountByPlace[id] ?: 0,
                sourceCount = sourceCountByPlace[id] ?: 0,
                distanceMeters = if (distAlias != null) row.getOrNull(distAlias) else null
            )
        }

        // ---- Published sources matching q ----
        val publishedSourceIds = Sunreis.slice(Sunreis.sourceId)
            .select { (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull()) }
            .map { it[Sunreis.sourceId] }.distinct()

        val sources = if (publishedSourceIds.isNotEmpty()) {
            Sources.select {
                (Sources.id inList publishedSourceIds) and (Sources.deletedAt.isNull()) and
                    ((Sources.name.lowerCase() like term) or (Sources.nameEn.lowerCase() like term) or
                        (Sources.nameKo.lowerCase() like term))
            }.limit(20).map { row ->
                val st = SourceType.valueOf(row[Sources.type])
                SourceDTO(
                    id = row[Sources.id],
                    type = AppSourceType.valueOf(st.name),
                    name = row[Sources.name],
                    nameEn = row[Sources.nameEn],
                    nameKo = row[Sources.nameKo],
                    synopsis = row[Sources.synopsis],
                    externalUrl = row[Sources.externalUrl],
                    posterImage = row[Sources.posterImage]?.toAppImageDTO(),
                    videoCount = null, spotCount = null, placeCount = null, nearestDistanceMeters = null
                )
            }
        } else emptyList()

        // ---- Published sunreis matching title/summary ----
        val sunreis = (Sunreis innerJoin Sources)
            .select {
                (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull()) and
                    ((Sunreis.title.lowerCase() like term) or (Sunreis.summary.lowerCase() like term))
            }
            .orderBy(Sunreis.createdAt to SortOrder.DESC)
            .limit(20).map { row ->
                val st = SourceType.valueOf(row[Sources.type])
                SunreiSummaryDTO(
                    id = row[Sunreis.id],
                    sourceId = row[Sunreis.sourceId],
                    sourceName = row[Sources.name],
                    sourceType = AppSourceType.valueOf(st.name),
                    title = row[Sunreis.title],
                    summary = row[Sunreis.summary],
                    link = row[Sunreis.link],
                    images = row[Sunreis.images].map { it.toAppImageDTO() },
                    spotCount = 0,
                    placeCount = null, areaCount = null, nearestDistanceMeters = null
                )
            }

        SearchResult(places = places, sources = sources, sunreis = sunreis)
    }

    private fun countSpotsByPlace(placeIds: List<String>): Map<String, Int> {
        if (placeIds.isEmpty()) return emptyMap()
        return SunreiSpots.slice(SunreiSpots.placeId, SunreiSpots.id.count())
            .select {
                (SunreiSpots.placeId inList placeIds) and (SunreiSpots.deletedAt.isNull())
            }
            .groupBy(SunreiSpots.placeId)
            .associate { it[SunreiSpots.placeId] to it[SunreiSpots.id.count()].toInt() }
    }

    private fun countSourcesByPlace(placeIds: List<String>): Map<String, Int> {
        if (placeIds.isEmpty()) return emptyMap()
        return (SunreiSpots innerJoin Sunreis)
            .slice(SunreiSpots.placeId, Sunreis.sourceId)
            .select {
                (SunreiSpots.placeId inList placeIds) and (SunreiSpots.deletedAt.isNull()) and
                    (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull())
            }
            .map { it[SunreiSpots.placeId] to it[Sunreis.sourceId] }
            .distinct()
            .groupBy { it.first }
            .mapValues { it.value.size }
    }
}

private fun Place.toPlaceDTO(): PlaceDTO = PlaceDTO(
    id = id,
    name = name,
    address = address,
    latitude = latitude,
    longitude = longitude,
    googleMapsId = googleMapsId,
    isClosed = isClosed,
    closedReason = closedReason,
    closedAt = closedAt,
    notes = notes
)

private fun com.sunrei.model.MultiSizeImage.toAppImageDTO() =
    MultiSizeImageDTO(
        images.map { ImageDTO(url = it.url, width = it.width, height = it.height) }
    )
