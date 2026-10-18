package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.ListPlacesResult
import com.sunrei.generated.dto.admin.PlaceListItemDTO
import com.sunrei.generated.dto.admin.UpdatePlaceRequest
import com.sunrei.model.Place
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
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
import org.jetbrains.exposed.sql.update
import java.sql.SQLIntegrityConstraintViolationException

class PlaceService(
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)

    /** 주소에서 지역명을 뽑는 로직이 없어 `area`는 항상 null이다. */
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

    /** 폐업으로 바꿀 때 closedAt을 기록하고, 다시 영업하면 closedAt과 closedReason을 지운다. */
    fun update(id: String, request: UpdatePlaceRequest): Place? = transaction {
        val existing = Places.select { (Places.id eq id) and (Places.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null
        val now = Clock.System.now()
        Places.update({ Places.id eq id }) { stmt ->
            stmt[Places.isClosed] = request.isClosed
            if (request.isClosed) {
                if (!existing[Places.isClosed]) stmt[Places.closedAt] = now
                request.closedReason?.let { stmt[Places.closedReason] = it }
            } else {
                stmt[Places.closedAt] = null
                stmt[Places.closedReason] = null
            }
            stmt[Places.updatedAt] = now
        }
        Places.select { Places.id eq id }.first().toPlace()
    }

    /**
     * nearby 모드에서 지도 화면 영역 안의 Place를 찾는다.
     * center는 사용자 위치가 아니라 지도 중심이며, 그 지점에서 가까운 순으로 정렬한다.
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

    /** source 모드에서는 지도 영역과 관계없이 고른 Source에 나온 Place를 모두 돌려준다. */
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
     * 같은 장소인지는 googleMapsId로 판정하고, googleMapsId가 없으면 좌표가 같은 Place를 쓴다.
     * 맞는 Place가 없을 때만 새로 만든다.
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
                // 같은 google_maps_id로 동시에 insert해 unique index에 막히면 먼저 들어간 행을 쓴다.
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
