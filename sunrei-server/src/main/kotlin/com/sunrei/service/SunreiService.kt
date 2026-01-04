package com.sunrei.service

import com.sunrei.config.JwtConfig
import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.database.SunreiTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.ListSunreisResult
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiSpotInline
import com.sunrei.model.Place
import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.routes.admin.converter.toModel
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class SunreiService(
    private val sunreiSpotService: SunreiSpotService,
    private val placeService: PlaceService
) {
    private val pageToken = PaginationToken(JwtConfig.getPageTokenSecret())

    fun list(): List<Sunrei> = transaction {
        val sunreis = Sunreis.select { Sunreis.deletedAt.isNull() }
            .orderBy(Sunreis.createdAt to SortOrder.DESC)
            .toList()

        buildSunreiList(sunreis)
    }

    fun getById(id: String): Sunrei? = transaction {
        val row = Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null

        val sunreiId = row[Sunreis.id]
        val spots = fetchSpotsMapBySunreiIds(listOf(sunreiId))[sunreiId] ?: emptyList()
        val tags = fetchTagsMapBySunreiIds(listOf(sunreiId))[sunreiId] ?: emptyList()

        buildSunreiFromRow(row, spots, tags)
    }

    fun listByPolygon(polygonWKT: String, limit: Int = 200): List<Sunrei> = transaction {
        // Step 1: Get places within polygon using PostGIS
        val places = placeService.listByPolygon(polygonWKT, limit = limit)
        if (places.isEmpty()) return@transaction emptyList()

        val placeIds = places.map { it.id }

        // Step 2: Get sunrei spots for those places
        val spotsMap = sunreiSpotService.listByPlaceIds(placeIds)
        if (spotsMap.isEmpty()) return@transaction emptyList()

        // Step 3: Get unique sunrei IDs from the spots
        val sunreiIds = spotsMap.values
            .flatten()
            .map { it.sunreiId }
            .distinct()

        // Step 4: Get sunreis and build with spots/tags
        val sunreis = Sunreis.select {
            (Sunreis.id inList sunreiIds) and (Sunreis.deletedAt.isNull())
        }.orderBy(Sunreis.createdAt to SortOrder.DESC)
            .toList()

        buildSunreiList(sunreis)
    }

    fun listByKeyword(nextToken: String? = null, size: Int = 20, keyword: String? = null): ListSunreisResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            var query = Sunreis.select { Sunreis.deletedAt.isNull() }

            // Apply search filter if provided
            if (!keyword.isNullOrBlank()) {
                query = query.andWhere {
                    (Sunreis.title like "%$keyword%") or
                            (Sunreis.description like "%$keyword%")
                }
            }

            // Get total count
            val totalElements = query.count().toInt()

            // Apply pagination
            val sunreis = query
                .orderBy(Sunreis.createdAt to SortOrder.DESC)
                .limit(effectiveSize, offset.toLong())
                .toList()

            val results = buildSunreiList(sunreis)

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListSunreisResult(
                data = results.map { it.toDTO() },
                totalSize = results.size,
                totalElements = totalElements,
                nextToken = newNextToken
            )
        }
    }

    private fun buildSunreiList(sunreiRows: List<org.jetbrains.exposed.sql.ResultRow>): List<Sunrei> {
        if (sunreiRows.isEmpty()) return emptyList()

        val sunreiIds = sunreiRows.map { it[Sunreis.id] }
        val spotsMap = fetchSpotsMapBySunreiIds(sunreiIds)
        val tagsMap = fetchTagsMapBySunreiIds(sunreiIds)

        return sunreiRows.map { row ->
            val sunreiId = row[Sunreis.id]
            buildSunreiFromRow(row, spotsMap[sunreiId] ?: emptyList(), tagsMap[sunreiId] ?: emptyList())
        }
    }

    private fun buildSunreiFromRow(
        row: org.jetbrains.exposed.sql.ResultRow,
        spots: List<SunreiSpot>,
        tags: List<Tag>
    ): Sunrei {
        return Sunrei(
            id = row[Sunreis.id],
            title = row[Sunreis.title],
            description = row[Sunreis.description],
            link = row[Sunreis.link],
            images = row[Sunreis.images],
            spots = spots,
            tags = tags,
            createdAt = row[Sunreis.createdAt],
            updatedAt = row[Sunreis.updatedAt]
        )
    }

    private fun fetchSpotsMapBySunreiIds(sunreiIds: List<String>): Map<String, List<SunreiSpot>> {
        if (sunreiIds.isEmpty()) return emptyMap()

        return (SunreiSpots innerJoin Places)
            .select { (SunreiSpots.sunreiId inList sunreiIds) and (SunreiSpots.deletedAt.isNull()) }
            .map { row ->
                val sunreiId = row[SunreiSpots.sunreiId]
                val spot = SunreiSpot(
                    id = row[SunreiSpots.id],
                    sunreiId = sunreiId,
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images],
                    place = Place(
                        id = row[Places.id],
                        name = row[Places.name],
                        address = row[Places.address],
                        latitude = row[Places.latitude],
                        longitude = row[Places.longitude],
                        googleMapsId = row[Places.googleMapsId],
                        isClosed = row[Places.isClosed],
                        closedReason = row[Places.closedReason],
                        closedAt = row[Places.closedAt],
                        notes = row[Places.notes],
                        deletedAt = row[Places.deletedAt]
                    )
                )
                sunreiId to spot
            }
            .groupBy({ it.first }, { it.second })
    }

    private fun fetchTagsMapBySunreiIds(sunreiIds: List<String>): Map<String, List<Tag>> {
        if (sunreiIds.isEmpty()) return emptyMap()

        return (SunreiTags innerJoin Tags)
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
    }

    fun create(request: CreateSunreiRequest): Sunrei = transaction {
        val sunreiId = Sunreis.insertAndGetId { stmt ->
            stmt[Sunreis.title] = request.title
            stmt[Sunreis.description] = request.description
            stmt[Sunreis.link] = request.link
            stmt[Sunreis.images] = request.images?.map { it.toModel() } ?: emptyList()
        }

        request.tagIds?.forEach { tagId ->
            SunreiTags.insert {
                it[SunreiTags.sunreiId] = sunreiId
                it[SunreiTags.tagId] = tagId
            }
        }

        request.spots?.forEach { spotRequest ->
            createSunreiSpot(sunreiId, spotRequest)
        }

        getById(sunreiId) ?: throw Exception("Failed to create Sunrei")
    }

    fun update(id: String, request: UpdateSunreiRequest): Sunrei? = transaction {
        Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null

        Sunreis.update({ Sunreis.id eq id }) { stmt ->
            request.title?.let { title -> stmt[Sunreis.title] = title }
            request.description?.let { desc -> stmt[Sunreis.description] = desc }
            request.link?.let { link -> stmt[Sunreis.link] = link }
            request.images?.let { imgs -> stmt[Sunreis.images] = imgs.map { it.toModel() } }
            stmt[Sunreis.updatedAt] = Clock.System.now()
        }

        if (request.tagIds != null) {
            SunreiTags.deleteWhere { sunreiId eq id }
            request.tagIds.forEach { tagId ->
                SunreiTags.insert {
                    it[SunreiTags.sunreiId] = id
                    it[SunreiTags.tagId] = tagId
                }
            }
        }

        request.spots?.let { spotsRequest ->
            val existingSpotIds =
                SunreiSpots.select { (SunreiSpots.sunreiId eq id) and (SunreiSpots.deletedAt.isNull()) }
                    .map { it[SunreiSpots.id] }

            spotsRequest.forEach { spotRequest ->
                if (spotRequest.id != null && spotRequest.id in existingSpotIds) {
                    updateSunreiSpot(spotRequest.id, spotRequest)
                } else if (spotRequest.id == null) {
                    createSunreiSpot(
                        id, CreateSunreiSpotInline(
                            title = spotRequest.title,
                            description = spotRequest.description,
                            youtubeLink = spotRequest.youtubeLink,
                            place = spotRequest.place,
                            images = spotRequest.images
                        )
                    )
                }
            }

            val requestSpotIds = spotsRequest.mapNotNull { it.id }
            val spotsToDelete = existingSpotIds.filter { it !in requestSpotIds }
            if (spotsToDelete.isNotEmpty()) {
                SunreiSpots.update({ SunreiSpots.id inList spotsToDelete }) {
                    it[deletedAt] = Clock.System.now()
                }
            }
        }

        getById(id)
    }

    fun delete(id: String): Boolean = transaction {
        val updateCount = Sunreis.update({ (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }) { stmt ->
            stmt[Sunreis.deletedAt] = Clock.System.now()
            stmt[Sunreis.updatedAt] = Clock.System.now()
        }

        if (updateCount > 0) {
            SunreiSpots.update({ SunreiSpots.sunreiId eq id }) { stmt ->
                stmt[SunreiSpots.deletedAt] = Clock.System.now()
            }
        }

        updateCount > 0
    }

    private fun createSunreiSpot(sunreiId: String, request: CreateSunreiSpotInline): String {
        val placeId = request.place?.let { placeInput ->
            findOrCreatePlace(placeInput)
        } ?: throw Exception("Place is required for SunreiSpot")

        return SunreiSpots.insertAndGetId { stmt ->
            stmt[SunreiSpots.sunreiId] = sunreiId
            stmt[SunreiSpots.title] = request.title
            stmt[SunreiSpots.description] = request.description
            stmt[SunreiSpots.placeId] = placeId
            stmt[SunreiSpots.youtubeLink] = request.youtubeLink
            stmt[SunreiSpots.images] = request.images?.map { it.toModel() } ?: emptyList()
        }
    }

    private fun updateSunreiSpot(spotId: String, request: UpdateSunreiSpotInline) {
        SunreiSpots.update({ SunreiSpots.id eq spotId }) { stmt ->
            request.title.let { title -> stmt[SunreiSpots.title] = title }
            request.description?.let { desc -> stmt[SunreiSpots.description] = desc }
            request.youtubeLink?.let { link -> stmt[SunreiSpots.youtubeLink] = link }
            request.place?.let { placeInput ->
                stmt[SunreiSpots.placeId] = findOrCreatePlace(placeInput)
            }
            request.images?.let { imgs -> stmt[SunreiSpots.images] = imgs.map { it.toModel() } }
            stmt[SunreiSpots.updatedAt] = Clock.System.now()
        }
    }

    private fun findOrCreatePlace(placeInput: PlaceInput): String {
        // 이미 존재하는 Place 를 확인해서 재사용한다
        val existingPlace = if (placeInput.googleMapsId != null) {
            Places.select { (Places.googleMapsId eq placeInput.googleMapsId) and (Places.deletedAt.isNull()) }
                .firstOrNull()
        } else {
            Places.select { (Places.latitude eq placeInput.latitude) and (Places.longitude eq placeInput.longitude) and (Places.deletedAt.isNull()) }
                .firstOrNull()
        }

        return existingPlace?.get(Places.id) ?: Places.insertAndGetId { stmt ->
            stmt[Places.name] = placeInput.name
            stmt[Places.address] = placeInput.address
            stmt[Places.latitude] = placeInput.latitude
            stmt[Places.longitude] = placeInput.longitude
            stmt[Places.googleMapsId] = placeInput.googleMapsId
            stmt[Places.isClosed] = false
        }
    }
}

