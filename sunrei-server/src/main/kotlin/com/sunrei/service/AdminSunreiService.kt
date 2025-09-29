package com.sunrei.service

import com.sunrei.config.JwtConfig
import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.ListSunreisResult
import com.sunrei.generated.dto.admin.MultiSizeImageDTO
import com.sunrei.generated.dto.admin.PlaceDTO
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.SunreiDTO
import com.sunrei.generated.dto.admin.SunreiSpotDTO
import com.sunrei.generated.dto.admin.TagDTO
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiSpotInline
import com.sunrei.model.Image
import com.sunrei.model.MultiSizeImage
import com.sunrei.model.Places
import com.sunrei.model.SunreiSpots
import com.sunrei.model.SunreiTags
import com.sunrei.model.Sunreis
import com.sunrei.model.Tags
import com.sunrei.model.insertAndGetId
import com.sunrei.utils.PaginationToken
import com.sunrei.utils.toAdminMultiSizeImages
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

class AdminSunreiService {
    private val pageToken = PaginationToken(JwtConfig.getPageTokenSecret())

    fun list(nextToken: String? = null, size: Int = 20, search: String? = null): ListSunreisResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            var query = Sunreis.select { Sunreis.deletedAt.isNull() }

            // Apply search filter if provided
            if (!search.isNullOrBlank()) {
                query = query.andWhere {
                    (Sunreis.title like "%$search%") or
                            (Sunreis.description like "%$search%")
                }
            }

            // Get total count
            val totalElements = query.count().toInt()

            // Apply pagination
            val results = query
                .orderBy(Sunreis.createdAt to SortOrder.DESC)
                .limit(effectiveSize, offset.toLong())
                .map { row ->
                    val sunreiId = row[Sunreis.id]
                    val spots = fetchSpotsForSunrei(sunreiId)
                    val tags = fetchTagsForSunrei(sunreiId)

                    SunreiDTO(
                        id = sunreiId,
                        title = row[Sunreis.title],
                        description = row[Sunreis.description],
                        link = row[Sunreis.link],
                        images = row[Sunreis.images].toAdminMultiSizeImages(),
                        spots = spots,
                        tags = tags,
                        createdAt = row[Sunreis.createdAt],
                        updatedAt = row[Sunreis.updatedAt]
                    )
                }

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListSunreisResult(
                data = results,
                totalSize = results.size,
                totalElements = totalElements,
                nextToken = newNextToken
            )
        }
    }

    private fun fetchSpotsForSunrei(sunreiId: String): List<SunreiSpotDTO> {
        return (SunreiSpots innerJoin Places)
            .select { (SunreiSpots.sunreiId eq sunreiId) and (SunreiSpots.deletedAt.isNull()) }
            .map { row ->
                SunreiSpotDTO(
                    id = row[SunreiSpots.id],
                    sunreiId = sunreiId,
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images].toAdminMultiSizeImages(),
                    place = PlaceDTO(
                        id = row[Places.id],
                        name = row[Places.name],
                        address = row[Places.address],
                        latitude = row[Places.latitude],
                        longitude = row[Places.longitude],
                        isClosed = row[Places.isClosed],
                        closedReason = row[Places.closedReason],
                        closedAt = row[Places.closedAt],
                        notes = row[Places.notes]
                    )
                )
            }
    }

    fun findOne(id: String): SunreiDTO? = transaction {
        Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull()?.let { row ->
                val sunreiId = row[Sunreis.id]
                val spots = fetchSpotsForSunrei(sunreiId)
                val tags = fetchTagsForSunrei(sunreiId)

                SunreiDTO(
                    id = sunreiId,
                    title = row[Sunreis.title],
                    description = row[Sunreis.description],
                    link = row[Sunreis.link],
                    images = row[Sunreis.images].toAdminMultiSizeImages(),
                    spots = spots,
                    tags = tags,
                    createdAt = row[Sunreis.createdAt],
                    updatedAt = row[Sunreis.updatedAt]
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

    fun create(request: CreateSunreiRequest): SunreiDTO = transaction {
        val sunreiId = Sunreis.insertAndGetId { stmt ->
            stmt[Sunreis.title] = request.title
            stmt[Sunreis.description] = request.description
            stmt[Sunreis.link] = request.link
            stmt[Sunreis.images] = request.images?.let { imgs -> convertFromAdminMultiSizeImages(imgs) } ?: emptyList()
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

        findOne(sunreiId) ?: throw Exception("Failed to create Sunrei")
    }

    fun update(id: String, request: UpdateSunreiRequest): SunreiDTO? = transaction {
        val existing = Sunreis.select { (Sunreis.id eq id) and (Sunreis.deletedAt.isNull()) }
            .firstOrNull() ?: return@transaction null

        Sunreis.update({ Sunreis.id eq id }) { stmt ->
            request.title?.let { title -> stmt[Sunreis.title] = title }
            request.description?.let { desc -> stmt[Sunreis.description] = desc }
            request.link?.let { link -> stmt[Sunreis.link] = link }
            request.images?.let { imgs -> stmt[Sunreis.images] = convertFromAdminMultiSizeImages(imgs) }
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

        findOne(id)
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
        val placeIdValue = request.place?.let { placeInput ->
            findOrCreatePlace(placeInput)
        } ?: throw Exception("Place is required for SunreiSpot")

        return SunreiSpots.insertAndGetId { stmt ->
            stmt[SunreiSpots.sunreiId] = sunreiId
            stmt[SunreiSpots.title] = request.title
            stmt[SunreiSpots.description] = request.description
            stmt[SunreiSpots.placeId] = placeIdValue
            stmt[SunreiSpots.youtubeLink] = request.youtubeLink
            stmt[SunreiSpots.images] = request.images?.let { imgs -> convertFromAdminMultiSizeImages(imgs) } ?: emptyList()
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
            request.images?.let { imgs -> stmt[SunreiSpots.images] = convertFromAdminMultiSizeImages(imgs) }
            stmt[SunreiSpots.updatedAt] = Clock.System.now()
        }
    }

    private fun findOrCreatePlace(placeInput: PlaceInput): String {
        val existingPlace =
            Places.select { (Places.latitude eq placeInput.latitude) and (Places.longitude eq placeInput.longitude) }
                .firstOrNull()

        return existingPlace?.get(Places.id) ?: Places.insertAndGetId { stmt ->
            stmt[Places.name] = placeInput.name
            stmt[Places.address] = placeInput.address
            stmt[Places.latitude] = placeInput.latitude
            stmt[Places.longitude] = placeInput.longitude
            stmt[Places.isClosed] = false
        }
    }

    private fun convertFromAdminMultiSizeImages(adminImages: List<MultiSizeImageDTO>): List<MultiSizeImage> {
        return adminImages.map { adminImage ->
            MultiSizeImage(
                images = adminImage.images.map { img ->
                    Image(
                        url = img.url,
                        width = img.width,
                        height = img.height
                    )
                }
            )
        }
    }
}