package com.sunrei.service

import com.sunrei.database.Sources
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.CreateSourceRequest
import com.sunrei.generated.dto.admin.ListSourcesResult
import com.sunrei.generated.dto.admin.UpdateSourceRequest
import com.sunrei.generated.dto.app.SourceDTO
import com.sunrei.generated.dto.app.SourceType as AppSourceType
import com.sunrei.generated.dto.app.SunreiSummaryDTO
import com.sunrei.model.Source
import com.sunrei.model.SourceType
import com.sunrei.routes.admin.converter.toModel
import com.sunrei.routes.admin.converter.toRowDTO
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class SourceService(
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)

    fun list(q: String? = null, nextToken: String? = null, size: Int = 20): ListSourcesResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            var query = Sources.select { Sources.deletedAt.isNull() }

            if (!q.isNullOrBlank()) {
                val term = "%${q.lowercase()}%"
                query = query.andWhere {
                    (Sources.name.lowerCase() like term) or
                        (Sources.nameEn.lowerCase() like term) or
                        (Sources.nameKo.lowerCase() like term)
                }
            }

            val totalElements = query.count().toInt()

            val rows = query
                .orderBy(Sources.createdAt to SortOrder.DESC)
                .limit(effectiveSize, offset.toLong())
                .toList()

            val sourceIds = rows.map { it[Sources.id] }
            val sunreiCountBySource = countSunreisBySource(sourceIds)
            val spotCountBySource = countSpotsBySource(sourceIds)

            val data = rows.map { row ->
                val id = row[Sources.id]
                row.toSource().toRowDTO(
                    sunreiCount = sunreiCountBySource[id] ?: 0,
                    spotCount = spotCountBySource[id] ?: 0
                )
            }

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListSourcesResult(
                data = data,
                totalSize = data.size,
                totalElements = totalElements,
                nextToken = newNextToken
            )
        }
    }

    fun getById(id: String): Source? = transaction {
        Sources.select { (Sources.id eq id) and (Sources.deletedAt.isNull()) }
            .firstOrNull()?.toSource()
    }

    fun search(q: String): List<Source> = transaction {
        val term = "%${q.lowercase()}%"
        Sources.select {
            (Sources.deletedAt.isNull()) and
                ((Sources.name.lowerCase() like term) or
                    (Sources.nameEn.lowerCase() like term) or
                    (Sources.nameKo.lowerCase() like term))
        }.orderBy(Sources.name to SortOrder.ASC)
            .map { it.toSource() }
    }

    fun create(request: CreateSourceRequest): Source = transaction {
        val id = Sources.insertAndGetId { stmt ->
            stmt[Sources.type] = request.type.name
            stmt[Sources.name] = request.name
            stmt[Sources.nameEn] = request.nameEn
            stmt[Sources.nameKo] = request.nameKo
            stmt[Sources.synopsis] = request.synopsis
            stmt[Sources.externalUrl] = request.externalUrl
            stmt[Sources.posterImage] = request.posterImage?.toModel()
        }
        getById(id) ?: error("Failed to create Source")
    }

    fun update(id: String, request: UpdateSourceRequest): Source? = transaction {
        Sources.select { (Sources.id eq id) and (Sources.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null

        Sources.update({ Sources.id eq id }) { stmt ->
            request.type?.let { stmt[Sources.type] = it.name }
            request.name?.let { stmt[Sources.name] = it }
            request.nameEn?.let { stmt[Sources.nameEn] = it }
            request.nameKo?.let { stmt[Sources.nameKo] = it }
            request.synopsis?.let { stmt[Sources.synopsis] = it }
            request.externalUrl?.let { stmt[Sources.externalUrl] = it }
            if (request.posterImage != null) stmt[Sources.posterImage] = request.posterImage.toModel()
            stmt[Sources.updatedAt] = Clock.System.now()
        }

        getById(id)
    }

    fun delete(id: String): Boolean = transaction {
        val updated = Sources.update({ (Sources.id eq id) and (Sources.deletedAt.isNull()) }) { stmt ->
            stmt[Sources.deletedAt] = Clock.System.now()
            stmt[Sources.updatedAt] = Clock.System.now()
        }
        updated > 0
    }

    private fun countSunreisBySource(sourceIds: List<String>): Map<String, Int> {
        if (sourceIds.isEmpty()) return emptyMap()
        return Sunreis
            .slice(Sunreis.sourceId, Sunreis.id.count())
            .select { (Sunreis.sourceId inList sourceIds) and (Sunreis.deletedAt.isNull()) }
            .groupBy(Sunreis.sourceId)
            .associate { it[Sunreis.sourceId] to it[Sunreis.id.count()].toInt() }
    }

    private fun countSpotsBySource(sourceIds: List<String>): Map<String, Int> {
        if (sourceIds.isEmpty()) return emptyMap()
        return (SunreiSpots innerJoin Sunreis)
            .slice(Sunreis.sourceId, SunreiSpots.id.count())
            .select {
                (Sunreis.sourceId inList sourceIds) and
                    (Sunreis.deletedAt.isNull()) and (SunreiSpots.deletedAt.isNull())
            }
            .groupBy(Sunreis.sourceId)
            .associate { it[Sunreis.sourceId] to it[SunreiSpots.id.count()].toInt() }
    }

    // ===== Public (app) =====

    data class PublicSourceDetail(val source: SourceDTO, val sunreis: List<SunreiSummaryDTO>)

    /** Published sources (>=1 published sunrei) matching q, with counts. */
    fun listPublic(q: String?): List<SourceDTO> = transaction {
        val publishedSourceIds = Sunreis
            .slice(Sunreis.sourceId)
            .select { (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull()) }
            .map { it[Sunreis.sourceId] }
            .distinct()
        if (publishedSourceIds.isEmpty()) return@transaction emptyList()

        var query = Sources.select {
            (Sources.id inList publishedSourceIds) and (Sources.deletedAt.isNull())
        }
        if (!q.isNullOrBlank()) {
            val term = "%${q.lowercase()}%"
            query = query.andWhere {
                (Sources.name.lowerCase() like term) or
                    (Sources.nameEn.lowerCase() like term) or
                    (Sources.nameKo.lowerCase() like term)
            }
        }
        val rows = query.orderBy(Sources.name to SortOrder.ASC).toList()
        val sourceIds = rows.map { it[Sources.id] }
        val videoCount = countPublishedSunreisBySource(sourceIds)
        val spotCount = countPublishedSpotsBySource(sourceIds)
        val placeCount = countPublishedPlacesBySource(sourceIds)

        rows.map { row -> row.toPublicSourceDTO(videoCount, spotCount, placeCount, null) }
    }

    /** One published source with its published sunrei summaries (source intro / managed page). */
    fun getPublicDetail(id: String): PublicSourceDetail? = transaction {
        val sourceRow = Sources.select {
            (Sources.id eq id) and (Sources.deletedAt.isNull())
        }.firstOrNull() ?: return@transaction null

        val sunreiRows = Sunreis.select {
            (Sunreis.sourceId eq id) and (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull())
        }.orderBy(Sunreis.createdAt to SortOrder.DESC).toList()

        val sunreiIds = sunreiRows.map { it[Sunreis.id] }
        val spotCountBySunrei = countSpotsBySunrei(sunreiIds)
        val placeCountBySunrei = countPlacesBySunrei(sunreiIds)
        val sourceName = sourceRow[Sources.name]
        val sourceType = SourceType.valueOf(sourceRow[Sources.type])

        val sourceDto = SourceDTO(
            id = sourceRow[Sources.id],
            type = AppSourceType.valueOf(sourceType.name),
            name = sourceName,
            nameEn = sourceRow[Sources.nameEn],
            nameKo = sourceRow[Sources.nameKo],
            synopsis = sourceRow[Sources.synopsis],
            externalUrl = sourceRow[Sources.externalUrl],
            posterImage = sourceRow[Sources.posterImage]?.toAppImage(),
            videoCount = sunreiRows.size,
            spotCount = spotCountBySunrei.values.sum(),
            placeCount = placeCountBySunrei.values.sum(),
            nearestDistanceMeters = null
        )

        val summaries = sunreiRows.map { row ->
            val sid = row[Sunreis.id]
            SunreiSummaryDTO(
                id = sid,
                sourceId = id,
                sourceName = sourceName,
                sourceType = AppSourceType.valueOf(sourceType.name),
                title = row[Sunreis.title],
                summary = row[Sunreis.summary],
                link = row[Sunreis.link],
                images = row[Sunreis.images].map { it.toAppImage() },
                spotCount = spotCountBySunrei[sid] ?: 0,
                placeCount = placeCountBySunrei[sid] ?: 0,
                areaCount = null,
                nearestDistanceMeters = null
            )
        }
        PublicSourceDetail(source = sourceDto, sunreis = summaries)
    }

    private fun countPublishedSunreisBySource(sourceIds: List<String>): Map<String, Int> {
        if (sourceIds.isEmpty()) return emptyMap()
        return Sunreis.slice(Sunreis.sourceId, Sunreis.id.count())
            .select {
                (Sunreis.sourceId inList sourceIds) and (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull())
            }
            .groupBy(Sunreis.sourceId)
            .associate { it[Sunreis.sourceId] to it[Sunreis.id.count()].toInt() }
    }

    private fun countPublishedSpotsBySource(sourceIds: List<String>): Map<String, Int> {
        if (sourceIds.isEmpty()) return emptyMap()
        return (SunreiSpots innerJoin Sunreis)
            .slice(Sunreis.sourceId, SunreiSpots.id.count())
            .select {
                (Sunreis.sourceId inList sourceIds) and (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull()) and (SunreiSpots.deletedAt.isNull())
            }
            .groupBy(Sunreis.sourceId)
            .associate { it[Sunreis.sourceId] to it[SunreiSpots.id.count()].toInt() }
    }

    private fun countPublishedPlacesBySource(sourceIds: List<String>): Map<String, Int> {
        if (sourceIds.isEmpty()) return emptyMap()
        return (SunreiSpots innerJoin Sunreis)
            .slice(Sunreis.sourceId, SunreiSpots.placeId)
            .select {
                (Sunreis.sourceId inList sourceIds) and (Sunreis.deletedAt.isNull()) and
                    (Sunreis.publishedAt.isNotNull()) and (SunreiSpots.deletedAt.isNull())
            }
            .map { it[Sunreis.sourceId] to it[SunreiSpots.placeId] }
            .distinct()
            .groupBy { it.first }
            .mapValues { it.value.size }
    }

    private fun countSpotsBySunrei(sunreiIds: List<String>): Map<String, Int> {
        if (sunreiIds.isEmpty()) return emptyMap()
        return SunreiSpots.slice(SunreiSpots.sunreiId, SunreiSpots.id.count())
            .select { (SunreiSpots.sunreiId inList sunreiIds) and (SunreiSpots.deletedAt.isNull()) }
            .groupBy(SunreiSpots.sunreiId)
            .associate { it[SunreiSpots.sunreiId] to it[SunreiSpots.id.count()].toInt() }
    }

    private fun countPlacesBySunrei(sunreiIds: List<String>): Map<String, Int> {
        if (sunreiIds.isEmpty()) return emptyMap()
        return SunreiSpots.slice(SunreiSpots.sunreiId, SunreiSpots.placeId)
            .select { (SunreiSpots.sunreiId inList sunreiIds) and (SunreiSpots.deletedAt.isNull()) }
            .map { it[SunreiSpots.sunreiId] to it[SunreiSpots.placeId] }
            .distinct()
            .groupBy { it.first }
            .mapValues { it.value.size }
    }

    private fun ResultRow.toPublicSourceDTO(
        videoCount: Map<String, Int>,
        spotCount: Map<String, Int>,
        placeCount: Map<String, Int>,
        nearestDistanceMeters: Double?
    ): SourceDTO {
        val id = this[Sources.id]
        val st = SourceType.valueOf(this[Sources.type])
        return SourceDTO(
            id = id,
            type = AppSourceType.valueOf(st.name),
            name = this[Sources.name],
            nameEn = this[Sources.nameEn],
            nameKo = this[Sources.nameKo],
            synopsis = this[Sources.synopsis],
            externalUrl = this[Sources.externalUrl],
            posterImage = this[Sources.posterImage]?.toAppImage(),
            videoCount = videoCount[id] ?: 0,
            spotCount = spotCount[id] ?: 0,
            placeCount = placeCount[id] ?: 0,
            nearestDistanceMeters = nearestDistanceMeters
        )
    }
}

private fun com.sunrei.model.MultiSizeImage.toAppImage() =
    com.sunrei.generated.dto.app.MultiSizeImageDTO(
        images.map {
            com.sunrei.generated.dto.app.ImageDTO(
                url = it.url,
                width = it.width,
                height = it.height
            )
        }
    )

/** Shared mapper: read a [Source] from any [ResultRow] that selects the Sources columns. */
internal fun ResultRow.toSource(): Source = Source(
    id = this[Sources.id],
    type = SourceType.valueOf(this[Sources.type]),
    name = this[Sources.name],
    nameEn = this[Sources.nameEn],
    nameKo = this[Sources.nameKo],
    synopsis = this[Sources.synopsis],
    externalUrl = this[Sources.externalUrl],
    posterImage = this[Sources.posterImage],
    deletedAt = this[Sources.deletedAt],
    createdAt = this[Sources.createdAt],
    updatedAt = this[Sources.updatedAt]
)
