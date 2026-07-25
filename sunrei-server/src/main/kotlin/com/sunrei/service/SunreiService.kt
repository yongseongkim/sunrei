package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.Sources
import com.sunrei.database.SunreiSpots
import com.sunrei.database.SunreiSpotTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.ListSunreisResult
import com.sunrei.generated.dto.admin.MultiSizeImageDTO
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiSpotInline
import com.sunrei.model.Place
import com.sunrei.model.Source
import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.routes.admin.converter.toModel
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class SunreiService(
    private val placeService: PlaceService,
    private val tagService: TagService,
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)

    fun list(
        nextToken: String? = null,
        size: Int = 20,
        q: String? = null,
        sourceId: String? = null,
        published: Boolean? = null
    ): ListSunreisResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            var query = Sunreis.select { Sunreis.deletedAt.isNull() }

            if (!q.isNullOrBlank()) {
                query = query.andWhere {
                    (Sunreis.title like "%$q%") or
                        (Sunreis.summary like "%$q%") or
                        (Sunreis.description like "%$q%")
                }
            }
            if (sourceId != null) {
                query = query.andWhere { Sunreis.sourceId eq sourceId }
            }
            if (published != null) {
                query = query.andWhere {
                    if (published) Sunreis.publishedAt.isNotNull() else Sunreis.publishedAt.isNull()
                }
            }

            val totalElements = query.count().toInt()
            val rows = query
                .orderBy(Sunreis.createdAt to SortOrder.DESC)
                .limit(effectiveSize, offset.toLong())
                .toList()

            val results = buildSunreiList(rows)
            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListSunreisResult(
                data = results.map { it.toDTO() },
                totalSize = results.size,
                totalElements = totalElements,
                nextToken = newNextToken
            )
        }
    }

    fun getById(id: String): Sunrei? = transaction {
        val row = Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null

        val source = fetchSourcesByIds(listOf(row[Sunreis.sourceId]))[row[Sunreis.sourceId]]
        val spots = fetchSpotsBySunreiIds(listOf(id))[id] ?: emptyList()
        buildSunreiFromRow(row, source, spots)
    }

    fun listBySource(sourceId: String): List<Sunrei> = transaction {
        val rows = Sunreis.select {
            (Sunreis.sourceId eq sourceId) and (Sunreis.deletedAt.isNull())
        }.orderBy(Sunreis.createdAt to SortOrder.DESC).toList()
        buildSunreiList(rows)
    }

    /** Public: a published sunrei with its source + spots (+ spot tags), or null. */
    fun getPublishedWithSpots(id: String, centerLat: Double? = null, centerLng: Double? = null): Sunrei? = transaction {
        val row = Sunreis.select {
            (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull())
        }.firstOrNull() ?: return@transaction null

        val source = fetchSourcesByIds(listOf(row[Sunreis.sourceId]))[row[Sunreis.sourceId]]
        val spots = fetchSpotsBySunreiIds(listOf(id), centerLat, centerLng)[id] ?: emptyList()
        buildSunreiFromRow(row, source, spots)
    }

    fun create(request: CreateSunreiRequest): Sunrei = transaction {
        requireSourceExists(request.sourceId)

        if (request.link != null) {
            val existing = Sunreis.select {
                (Sunreis.link eq request.link) and (Sunreis.deletedAt.isNull())
            }.firstOrNull()
            if (existing != null) {
                throw ConflictException("Sunrei with this link already exists", existing[Sunreis.id])
            }
        }

        val sunreiId = Sunreis.insertAndGetId { stmt ->
            stmt[Sunreis.sourceId] = request.sourceId
            stmt[Sunreis.publishedAt] = if (request.published) Clock.System.now() else null
            stmt[Sunreis.title] = request.title
            stmt[Sunreis.summary] = request.summary
            stmt[Sunreis.description] = request.description
            stmt[Sunreis.link] = request.link
            stmt[Sunreis.images] = request.images?.map { it.toModel() } ?: emptyList()
        }

        request.spots?.forEach { spot -> createSunreiSpot(sunreiId, spot) }

        getById(sunreiId) ?: error("Failed to create Sunrei")
    }

    fun update(id: String, request: UpdateSunreiRequest): Sunrei? = transaction {
        val existing = Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null
        val currentPublishedAt = existing[Sunreis.publishedAt]

        request.sourceId?.let { requireSourceExists(it) }

        Sunreis.update({ Sunreis.id eq id }) { stmt ->
            request.sourceId?.let { stmt[Sunreis.sourceId] = it }
            request.title?.let { stmt[Sunreis.title] = it }
            request.summary?.let { stmt[Sunreis.summary] = it }
            request.description?.let { stmt[Sunreis.description] = it }
            request.link?.let { stmt[Sunreis.link] = it }
            request.images?.let { stmt[Sunreis.images] = it.map { img -> img.toModel() } }
            request.published?.let { published ->
                when (published) {
                    // Preserve the original publish time on re-save; only set if currently null.
                    true -> if (currentPublishedAt == null) stmt[Sunreis.publishedAt] = Clock.System.now()
                    false -> stmt[Sunreis.publishedAt] = null
                }
            }
            stmt[Sunreis.updatedAt] = Clock.System.now()
        }

        request.spots?.let { spotRequests ->
            val existingSpotIds = SunreiSpots
                .select { (SunreiSpots.sunreiId eq id) and (SunreiSpots.deletedAt.isNull()) }
                .map { it[SunreiSpots.id] }

            spotRequests.forEach { spot ->
                when {
                    spot.id != null && spot.id in existingSpotIds && spot.delete == true ->
                        softDeleteSpot(spot.id)

                    spot.id != null && spot.id in existingSpotIds ->
                        updateSunreiSpot(spot.id, spot)

                    spot.id == null && spot.delete != true ->
                        createSunreiSpot(id, spot)
                    // new spot marked for delete, or unknown id: ignore
                }
            }

            val requestSpotIds = spotRequests.mapNotNull { it.id }
            val omitted = existingSpotIds.filter { it !in requestSpotIds }
            if (omitted.isNotEmpty()) softDeleteSpots(omitted)
        }

        getById(id)
    }

    fun delete(id: String): Boolean = transaction {
        val updated = Sunreis.update({ (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }) { stmt ->
            stmt[Sunreis.deletedAt] = Clock.System.now()
            stmt[Sunreis.updatedAt] = Clock.System.now()
        }

        if (updated > 0) {
            SunreiSpots.update({ SunreiSpots.sunreiId eq id }) { it[deletedAt] = Clock.System.now() }
        }
        updated > 0
    }

    // ===== Spot write helpers =====

    private fun createSunreiSpot(sunreiId: String, spot: CreateSunreiSpotInline): String =
        doCreateSpot(
            sunreiId, spot.title, spot.context, spot.youtubeLink,
            spot.place, spot.images, spot.tagIds, spot.tagLabels
        )

    private fun createSunreiSpot(sunreiId: String, spot: UpdateSunreiSpotInline): String =
        doCreateSpot(
            sunreiId, spot.title, spot.context, spot.youtubeLink,
            spot.place, spot.images, spot.tagIds, spot.tagLabels
        )

    @Suppress("UNUSED_PARAMETER")
    private fun doCreateSpot(
        sunreiId: String,
        title: String,
        context: String?,
        youtubeLink: String?,
        place: PlaceInput?,
        images: List<MultiSizeImageDTO>?,
        tagIds: List<String>?,
        tagLabels: List<String>?
    ): String {
        val placeId = place?.let {
            placeService.findOrCreatePlace(it.name, it.address, it.latitude, it.longitude, it.googleMapsId)
        } ?: error("Place is required for SunreiSpot")

        val spotId = SunreiSpots.insertAndGetId { stmt ->
            stmt[SunreiSpots.sunreiId] = sunreiId
            stmt[SunreiSpots.title] = title
            stmt[SunreiSpots.context] = context
            stmt[SunreiSpots.placeId] = placeId
            stmt[SunreiSpots.youtubeLink] = youtubeLink
            stmt[SunreiSpots.images] = images?.map { it.toModel() } ?: emptyList()
        }

        resolveTagIds(tagIds, tagLabels)?.forEach { tagId ->
            SunreiSpotTags.insert {
                it[SunreiSpotTags.sunreiSpotId] = spotId
                it[SunreiSpotTags.tagId] = tagId
            }
        }
        return spotId
    }

    private fun updateSunreiSpot(spotId: String, spot: UpdateSunreiSpotInline) {
        SunreiSpots.update({ SunreiSpots.id eq spotId }) { stmt ->
            stmt[SunreiSpots.title] = spot.title
            spot.context?.let { stmt[SunreiSpots.context] = it }
            spot.youtubeLink?.let { stmt[SunreiSpots.youtubeLink] = it }
            spot.place?.let { placeInput ->
                stmt[SunreiSpots.placeId] = placeService.findOrCreatePlace(
                    placeInput.name, placeInput.address, placeInput.latitude, placeInput.longitude, placeInput.googleMapsId
                )
            }
            spot.images?.let { stmt[SunreiSpots.images] = it.map { img -> img.toModel() } }
            stmt[SunreiSpots.updatedAt] = Clock.System.now()
        }

        val resolved = resolveTagIds(spot.tagIds, spot.tagLabels)
        if (resolved != null) {
            SunreiSpotTags.deleteWhere { SunreiSpotTags.sunreiSpotId eq spotId }
            resolved.forEach { tagId ->
                SunreiSpotTags.insert {
                    it[SunreiSpotTags.sunreiSpotId] = spotId
                    it[SunreiSpotTags.tagId] = tagId
                }
            }
        }
    }

    /** Returns null when neither tagIds nor tagLabels is present (=> no tag change requested). */
    private fun resolveTagIds(tagIds: List<String>?, tagLabels: List<String>?): List<String>? {
        if (tagIds == null && tagLabels == null) return null
        val ids = (tagIds ?: emptyList()).toMutableList()
        tagLabels?.forEach { label -> ids.add(tagService.findOrCreateByKoLabel(label).id) }
        return ids.distinct()
    }

    private fun softDeleteSpot(spotId: String) = softDeleteSpots(listOf(spotId))

    private fun softDeleteSpots(spotIds: List<String>) {
        if (spotIds.isEmpty()) return
        SunreiSpots.update({ SunreiSpots.id inList spotIds }) { it[deletedAt] = Clock.System.now() }
    }

    private fun requireSourceExists(sourceId: String) {
        val exists = Sources.select { (Sources.id eq sourceId) and (Sources.deletedAt.isNull()) }.count() > 0
        require(exists) { "Source $sourceId not found" }
    }

    // ===== Read helpers =====

    private fun buildSunreiList(rows: List<ResultRow>): List<Sunrei> {
        if (rows.isEmpty()) return emptyList()

        val sunreiIds = rows.map { it[Sunreis.id] }
        val sourceIds = rows.map { it[Sunreis.sourceId] }.distinct()

        val sourcesById = fetchSourcesByIds(sourceIds)
        val spotsBySunrei = fetchSpotsBySunreiIds(sunreiIds)

        return rows.map { row ->
            val sunreiId = row[Sunreis.id]
            buildSunreiFromRow(
                row,
                source = sourcesById[row[Sunreis.sourceId]],
                spots = spotsBySunrei[sunreiId] ?: emptyList()
            )
        }
    }

    private fun buildSunreiFromRow(row: ResultRow, source: Source?, spots: List<SunreiSpot>): Sunrei = Sunrei(
        id = row[Sunreis.id],
        sourceId = row[Sunreis.sourceId],
        source = source,
        publishedAt = row[Sunreis.publishedAt],
        title = row[Sunreis.title],
        description = row[Sunreis.description],
        summary = row[Sunreis.summary],
        link = row[Sunreis.link],
        images = row[Sunreis.images],
        spots = spots,
        createdAt = row[Sunreis.createdAt],
        updatedAt = row[Sunreis.updatedAt]
    )

    private fun fetchSourcesByIds(sourceIds: List<String>): Map<String, Source> {
        if (sourceIds.isEmpty()) return emptyMap()
        return Sources.select { Sources.id inList sourceIds }
            .associate { it[Sources.id] to it.toSource() }
    }

    private fun fetchSpotsBySunreiIds(
        sunreiIds: List<String>,
        centerLat: Double? = null,
        centerLng: Double? = null
    ): Map<String, List<SunreiSpot>> {
        if (sunreiIds.isEmpty()) return emptyMap()

        // With a center anchor, compute per-spot distance and return spots nearest-first.
        val dist =
            if (centerLat != null && centerLng != null)
                StDistanceMeters(Places.geom, centerLng, centerLat).alias("spot_dist")
            else null

        val rows = if (dist != null) {
            val cols: List<Expression<*>> = SunreiSpots.columns + Places.columns
            (SunreiSpots innerJoin Places)
                .slice(cols + dist)
                .select { (SunreiSpots.sunreiId inList sunreiIds) and (SunreiSpots.deletedAt.isNull()) }
                .orderBy(dist to SortOrder.ASC)
                .toList()
        } else {
            (SunreiSpots innerJoin Places)
                .select { (SunreiSpots.sunreiId inList sunreiIds) and (SunreiSpots.deletedAt.isNull()) }
                .toList()
        }

        val spotIds = rows.map { it[SunreiSpots.id] }.distinct()
        val tagsBySpot = fetchTagsBySpotIds(spotIds)

        return rows.groupBy(
            keySelector = { it[SunreiSpots.sunreiId] },
            valueTransform = { row ->
                val spotId = row[SunreiSpots.id]
                SunreiSpot(
                    id = spotId,
                    sunreiId = row[SunreiSpots.sunreiId],
                    title = row[SunreiSpots.title],
                    context = row[SunreiSpots.context],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images],
                    place = row.toPlace(),
                    tags = tagsBySpot[spotId] ?: emptyList(),
                    distanceMeters = dist?.let { row.getOrNull(it) }
                )
            }
        )
    }

    private fun fetchTagsBySpotIds(spotIds: List<String>): Map<String, List<Tag>> {
        if (spotIds.isEmpty()) return emptyMap()
        return (SunreiSpotTags innerJoin Tags)
            .select { SunreiSpotTags.sunreiSpotId inList spotIds }
            .groupBy(
                keySelector = { it[SunreiSpotTags.sunreiSpotId] },
                valueTransform = { row ->
                    Tag(
                        id = row[Tags.id],
                        labelEn = row[Tags.labelEn],
                        labelKo = row[Tags.labelKo],
                        description = row[Tags.description]
                    )
                }
            )
    }
}

class ConflictException(message: String, val existingId: String) : RuntimeException(message)
