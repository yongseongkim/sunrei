package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.ListPlacesResult
import com.sunrei.generated.dto.admin.PlaceListItemDTO
import com.sunrei.model.Place
import com.sunrei.utils.PaginationToken
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import java.sql.SQLIntegrityConstraintViolationException

class PlaceService(
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)

    /**
     * Admin place list keyed by Google place_id. Each row carries spot/source counts.
     * `area` is left null here (locality derivation is a later refinement).
     */
    fun list(q: String? = null, nextToken: String? = null, size: Int = 20): ListPlacesResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            var query = Places.select { Places.deletedAt.isNull() }

            if (!q.isNullOrBlank()) {
                val term = "%${q.lowercase()}%"
                query = query.andWhere {
                    (Places.name.lowerCase() like term) or (Places.address.lowerCase() like term)
                }
            }

            val totalElements = query.count().toInt()
            val rows = query
                .orderBy(Places.createdAt to SortOrder.DESC)
                .limit(effectiveSize, offset.toLong())
                .toList()

            val placeIds = rows.map { it[Places.id] }
            val spotCountByPlace = countSpotsByPlace(placeIds)
            val sourceCountByPlace = countSourcesByPlace(placeIds)

            val data = rows.map { row ->
                val id = row[Places.id]
                PlaceListItemDTO(
                    id = id,
                    name = row[Places.name],
                    address = row[Places.address],
                    latitude = row[Places.latitude],
                    longitude = row[Places.longitude],
                    googleMapsId = row[Places.googleMapsId],
                    isClosed = row[Places.isClosed],
                    area = null,
                    sourceCount = sourceCountByPlace[id] ?: 0,
                    spotCount = spotCountByPlace[id] ?: 0
                )
            }

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListPlacesResult(
                data = data,
                totalSize = data.size,
                totalElements = totalElements,
                nextToken = newNextToken
            )
        }
    }

    fun getById(id: String): Place? = transaction {
        Places.select { (Places.id eq id) and (Places.deletedAt.isNull()) }
            .firstOrNull()?.toPlace()
    }

    /**
     * Nearby mode: places inside the browser viewport bbox, distance-anchored to the
     * map center (computed from bounds center if absent), published-gated, nearest first.
     */
    fun listInBoundsWithDistance(
        swLat: Double,
        swLng: Double,
        neLat: Double,
        neLng: Double,
        centerLat: Double?,
        centerLng: Double?,
        limit: Int = 200
    ): List<Pair<Place, Double?>> = transaction {
        val cLat = centerLat ?: (swLat + neLat) / 2.0
        val cLng = centerLng ?: (swLng + neLng) / 2.0

        // Place ids with at least one published spot.
        val publishedPlaceIds = (SunreiSpots innerJoin Sunreis)
            .slice(SunreiSpots.placeId)
            .select {
                (SunreiSpots.deletedAt.isNull()) and
                    (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull())
            }
            .map { it[SunreiSpots.placeId] }
            .distinct()
        if (publishedPlaceIds.isEmpty()) return@transaction emptyList()

        val envelope = StMakeEnvelope(minLng = swLng, minLat = swLat, maxLng = neLng, maxLat = neLat)
        val dist = StDistanceMeters(Places.geom, cLng, cLat).alias("dist")

        Places.slice(Places.columns + dist)
            .select {
                (Places.deletedAt.isNull()) and
                    (Places.id inList publishedPlaceIds) and
                    stWithin(Places.geom, envelope)
            }
            .orderBy(dist to SortOrder.ASC)
            .limit(limit)
            .map { it.toPlace() to it.getOrNull(dist) }
    }

    /**
     * Source mode (global): every place featured by any selected source, published-gated,
     * nearest to the optional center. No viewport bound.
     */
    fun listBySourcesWithDistance(
        sourceIds: List<String>,
        centerLat: Double?,
        centerLng: Double?
    ): List<Pair<Place, Double?>> = transaction {
        if (sourceIds.isEmpty()) return@transaction emptyList()

        val placeIds = (SunreiSpots innerJoin Sunreis)
            .slice(SunreiSpots.placeId)
            .select {
                (Sunreis.sourceId inList sourceIds) and
                    (SunreiSpots.deletedAt.isNull()) and
                    (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull())
            }
            .map { it[SunreiSpots.placeId] }
            .distinct()
        if (placeIds.isEmpty()) return@transaction emptyList()

        val hasCenter = centerLat != null && centerLng != null
        val dist = if (hasCenter) StDistanceMeters(Places.geom, centerLng!!, centerLat!!).alias("dist") else null

        val rows = if (dist != null) {
            Places.slice(Places.columns + dist)
                .select { (Places.deletedAt.isNull()) and (Places.id inList placeIds) }
                .orderBy(dist to SortOrder.ASC)
                .toList()
        } else {
            Places.select { (Places.deletedAt.isNull()) and (Places.id inList placeIds) }.toList()
        }
        rows.map { row ->
            row.toPlace() to (if (dist != null) row.getOrNull(dist) else null)
        }
    }

    /**
     * Find an existing non-deleted Place by googleMapsId (the dedupe key), else by lat/lng,
     * or create a new one. Race-safe against the partial unique index on google_maps_id.
     * Returns the place ID.
     */
    fun findOrCreatePlace(
        name: String,
        address: String,
        latitude: Float,
        longitude: Float,
        googleMapsId: String?
    ): String = transaction {
        val existing = if (googleMapsId != null) {
            Places.select { (Places.googleMapsId eq googleMapsId) and (Places.deletedAt.isNull()) }
                .firstOrNull()
        } else {
            Places.select {
                (Places.latitude eq latitude) and (Places.longitude eq longitude) and (Places.deletedAt.isNull())
            }.firstOrNull()
        }

        existing?.get(Places.id) ?: run {
            try {
                Places.insertAndGetId { stmt ->
                    stmt[Places.name] = name
                    stmt[Places.address] = address
                    stmt[Places.latitude] = latitude
                    stmt[Places.longitude] = longitude
                    stmt[Places.googleMapsId] = googleMapsId
                    stmt[Places.isClosed] = false
                }
            } catch (_: SQLIntegrityConstraintViolationException) {
                // Lost a concurrent insert on the same google_maps_id; reuse that row.
                if (googleMapsId != null) {
                    Places.select { (Places.googleMapsId eq googleMapsId) and (Places.deletedAt.isNull()) }
                        .first()[Places.id]
                } else {
                    Places.select {
                        (Places.latitude eq latitude) and (Places.longitude eq longitude) and (Places.deletedAt.isNull())
                    }.first()[Places.id]
                }
            }
        }
    }

    private fun countSpotsByPlace(placeIds: List<String>): Map<String, Int> {
        if (placeIds.isEmpty()) return emptyMap()
        return SunreiSpots
            .slice(SunreiSpots.placeId, SunreiSpots.id.count())
            .select { (SunreiSpots.placeId inList placeIds) and (SunreiSpots.deletedAt.isNull()) }
            .groupBy(SunreiSpots.placeId)
            .associate { it[SunreiSpots.placeId] to it[SunreiSpots.id.count()].toInt() }
    }

    private fun countSourcesByPlace(placeIds: List<String>): Map<String, Int> {
        if (placeIds.isEmpty()) return emptyMap()
        // Distinct (placeId, sourceId) pairs -> count distinct sources per place.
        return (SunreiSpots innerJoin Sunreis)
            .slice(SunreiSpots.placeId, Sunreis.sourceId)
            .select {
                (SunreiSpots.placeId inList placeIds) and
                    (SunreiSpots.deletedAt.isNull()) and (Sunreis.deletedAt.isNull())
            }
            .map { it[SunreiSpots.placeId] to it[Sunreis.sourceId] }
            .distinct()
            .groupBy { it.first }
            .mapValues { it.value.size }
    }
}

/**
 * Shared mapper: read a [Place] from any [ResultRow] that selects the Places columns.
 * Used by [PlaceService] and the public/Phase B queries.
 */
fun ResultRow.toPlace(): Place = Place(
    id = this[Places.id],
    name = this[Places.name],
    address = this[Places.address],
    latitude = this[Places.latitude],
    longitude = this[Places.longitude],
    googleMapsId = this[Places.googleMapsId],
    isClosed = this[Places.isClosed],
    closedReason = this[Places.closedReason],
    closedAt = this[Places.closedAt],
    notes = this[Places.notes],
    deletedAt = this[Places.deletedAt]
)
