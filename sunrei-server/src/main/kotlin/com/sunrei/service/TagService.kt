package com.sunrei.service

import com.sunrei.database.SunreiSpots
import com.sunrei.database.SunreiSpotTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.ListTagsResult
import com.sunrei.model.Tag
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.utils.PaginationToken
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.innerJoin
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import java.sql.SQLIntegrityConstraintViolationException

class TagService(
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)

    fun list(nextToken: String? = null, size: Int = 20): ListTagsResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            val query = Tags.selectAll()
            val totalElements = query.count().toInt()

            val rows = query
                .orderBy(Tags.labelKo to SortOrder.ASC)
                .limit(effectiveSize, offset.toLong())
                .toList()
            val tags = rows.map { it.toTag() }

            val spotCountByTagId = countSpotsByTag(tags.map { it.id })

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListTagsResult(
                data = tags.map { it.toDTO() },
                totalSize = tags.size,
                totalElements = totalElements,
                nextToken = newNextToken,
                spotCountByTagId = spotCountByTagId
            )
        }
    }

    fun listAll(): List<Tag> = transaction {
        Tags.selectAll().orderBy(Tags.labelKo to SortOrder.ASC).map { it.toTag() }
    }

    fun getById(id: String): Tag? = transaction {
        Tags.select { Tags.id eq id }.firstOrNull()?.toTag()
    }

    /** Search both labels (case-insensitive). */
    fun search(q: String): List<Tag> = transaction {
        if (q.isBlank()) return@transaction emptyList()
        val term = "%${q.lowercase()}%"
        Tags.select {
            (Tags.labelEn.lowerCase() like term) or (Tags.labelKo.lowerCase() like term)
        }.orderBy(Tags.labelKo to SortOrder.ASC).map { it.toTag() }
    }

    /**
     * Find a tag by its Korean label (case-insensitive), or create one with
     * ko = typed, en = typed (until translated). Race-safe on the unique lower(label_ko) index.
     */
    fun findOrCreateByKoLabel(koLabel: String): Tag = transaction {
        val normalized = koLabel.trim()
        require(normalized.isNotEmpty()) { "Tag label must not be empty" }

        Tags.select { Tags.labelKo.lowerCase() eq normalized.lowercase() }
            .firstOrNull()?.toTag() ?: run {
            try {
                val id = Tags.insertAndGetId { stmt ->
                    stmt[Tags.labelEn] = normalized
                    stmt[Tags.labelKo] = normalized
                }
                Tag(id = id, labelEn = normalized, labelKo = normalized, description = null)
            } catch (_: SQLIntegrityConstraintViolationException) {
                Tags.select { Tags.labelKo.lowerCase() eq normalized.lowercase() }.first().toTag()
            }
        }
    }

    fun create(labelEn: String, labelKo: String, description: String?): Tag = transaction {
        require(labelKo.isNotBlank()) { "Korean label must not be empty" }
        val koExists = Tags.select { Tags.labelKo.lowerCase() eq labelKo.lowercase() }.count() > 0
        if (koExists) {
            throw IllegalArgumentException("Tag with Korean label '$labelKo' already exists")
        }

        try {
            val id = Tags.insertAndGetId { stmt ->
                stmt[Tags.labelEn] = labelEn
                stmt[Tags.labelKo] = labelKo
                stmt[Tags.description] = description
            }
            Tag(id = id, labelEn = labelEn, labelKo = labelKo, description = description)
        } catch (_: SQLIntegrityConstraintViolationException) {
            throw IllegalArgumentException("Tag with Korean label '$labelKo' already exists")
        }
    }

    fun update(
        id: String,
        labelEn: String?,
        labelKo: String?,
        description: String?
    ): Tag? = transaction {
        val existing = Tags.select { Tags.id eq id }.singleOrNull() ?: return@transaction null

        if (labelKo != null && labelKo != existing[Tags.labelKo]) {
            val koExists = Tags.select {
                (Tags.labelKo.lowerCase() eq labelKo.lowercase()) and (Tags.id neq id)
            }.count() > 0
            if (koExists) {
                throw IllegalArgumentException("Tag with Korean label '$labelKo' already exists")
            }
        }

        Tags.update({ Tags.id eq id }) { stmt ->
            labelEn?.let { stmt[Tags.labelEn] = it }
            labelKo?.let { stmt[Tags.labelKo] = it }
            description?.let { stmt[Tags.description] = it }
        }

        Tags.select { Tags.id eq id }.singleOrNull()?.toTag()
    }

    data class SpotSummary(
        val id: String,
        val title: String,
        val sunreiId: String,
        val sunreiTitle: String
    )

    data class TagWithSpotsData(
        val tag: Tag,
        val spots: List<SpotSummary>
    )

    fun getWithSpots(tagId: String): TagWithSpotsData? = transaction {
        val tag = Tags.select { Tags.id eq tagId }.firstOrNull()?.toTag() ?: return@transaction null

        val spots = (SunreiSpotTags innerJoin SunreiSpots innerJoin Sunreis)
            .select { SunreiSpotTags.tagId eq tagId }
            .orderBy(Sunreis.createdAt to SortOrder.DESC)
            .map { row ->
                SpotSummary(
                    id = row[SunreiSpots.id],
                    title = row[SunreiSpots.title],
                    sunreiId = row[Sunreis.id],
                    sunreiTitle = row[Sunreis.title]
                )
            }

        TagWithSpotsData(tag = tag, spots = spots)
    }

    /** Detach a single spot from this tag. */
    fun detach(tagId: String, spotId: String): Boolean = transaction {
        SunreiSpotTags.deleteWhere {
            (SunreiSpotTags.tagId eq tagId) and (SunreiSpotTags.sunreiSpotId eq spotId)
        } > 0
    }

    /** Hard delete a tag (cascades to sunrei_spot_tags). */
    fun delete(id: String): Boolean = transaction {
        Tags.deleteWhere { Tags.id eq id } > 0
    }

    private fun countSpotsByTag(tagIds: List<String>): Map<String, Int> {
        if (tagIds.isEmpty()) return emptyMap()
        return SunreiSpotTags
            .slice(SunreiSpotTags.tagId, SunreiSpotTags.sunreiSpotId.count())
            .select { SunreiSpotTags.tagId inList tagIds }
            .groupBy(SunreiSpotTags.tagId)
            .associate { it[SunreiSpotTags.tagId] to it[SunreiSpotTags.sunreiSpotId.count()].toInt() }
    }

    private fun ResultRow.toTag(): Tag = Tag(
        id = this[Tags.id],
        labelEn = this[Tags.labelEn],
        labelKo = this[Tags.labelKo],
        description = this[Tags.description]
    )
}
