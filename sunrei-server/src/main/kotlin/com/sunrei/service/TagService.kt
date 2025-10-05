package com.sunrei.service

import com.sunrei.config.JwtConfig
import com.sunrei.database.SunreiTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.generated.dto.admin.ListTagsResult
import com.sunrei.model.Tag
import com.sunrei.routes.admin.converter.toDTO
import com.sunrei.utils.IdGenerator
import com.sunrei.utils.PaginationToken
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.innerJoin
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class TagService {
    private val pageToken = PaginationToken(JwtConfig.getPageTokenSecret())

    fun list(nextToken: String? = null, size: Int = 20): ListTagsResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        return transaction {
            val query = Tags.selectAll()

            // Get total count
            val totalElements = query.count().toInt()

            // Apply pagination
            val tags = query
                .orderBy(Tags.name to SortOrder.ASC)
                .limit(effectiveSize, offset.toLong())
                .map { row ->
                    Tag(
                        id = row[Tags.id],
                        name = row[Tags.name],
                        description = row[Tags.description]
                    )
                }

            // Get Sunrei count for each tag
            val tagIds = tags.map { it.id }
            val sunreiCountByTagId = if (tagIds.isNotEmpty()) {
                SunreiTags
                    .slice(SunreiTags.tagId, SunreiTags.sunreiId.count())
                    .select { SunreiTags.tagId inList tagIds }
                    .groupBy(SunreiTags.tagId)
                    .associate { row ->
                        row[SunreiTags.tagId] to row[SunreiTags.sunreiId.count()].toInt()
                    }
            } else {
                emptyMap()
            }

            val newNextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)

            ListTagsResult(
                data = tags.map { it.toDTO() },
                totalSize = tags.size,
                totalElements = totalElements,
                nextToken = newNextToken,
                sunreiCountByTagId = sunreiCountByTagId
            )
        }
    }

    fun listAll(): List<Tag> = transaction {
        Tags.selectAll()
            .map { row ->
                Tag(
                    id = row[Tags.id],
                    name = row[Tags.name],
                    description = row[Tags.description]
                )
            }
    }

    fun searchByName(query: String): List<Tag> = transaction {
        Tags.select { Tags.name.lowerCase() like "%${query.lowercase()}%" }
            .map { row ->
                Tag(
                    id = row[Tags.id],
                    name = row[Tags.name],
                    description = row[Tags.description]
                )
            }
    }

    fun create(name: String, description: String?): Tag = transaction {
        // Check if tag with this name already exists
        val nameExists = Tags.select { Tags.name eq name }.count() > 0
        if (nameExists) {
            throw IllegalArgumentException("Tag with name '$name' already exists")
        }

        val id = IdGenerator.generate("T")

        Tags.insert {
            it[Tags.id] = id
            it[Tags.name] = name
            it[Tags.description] = description
        }

        Tag(
            id = id,
            name = name,
            description = description
        )
    }

    fun update(id: String, name: String?, description: String?): Tag? = transaction {
        val existing = Tags.select { Tags.id eq id }.singleOrNull() ?: return@transaction null

        // Check if name is being updated and if it already exists
        if (name != null && name != existing[Tags.name]) {
            val nameExists = Tags.select { (Tags.name eq name) and (Tags.id neq id) }
                .count() > 0
            if (nameExists) {
                throw IllegalArgumentException("Tag with name '$name' already exists")
            }
        }

        Tags.update({ Tags.id eq id }) {
            if (name != null) it[Tags.name] = name
            if (description != null) it[Tags.description] = description
        }

        Tags.select { Tags.id eq id }
            .singleOrNull()
            ?.let { row ->
                Tag(
                    id = row[Tags.id],
                    name = row[Tags.name],
                    description = row[Tags.description]
                )
            }
    }

    data class TagWithSunreisData(
        val tag: Tag,
        val sunreis: List<SunreiBasicData>
    )

    data class SunreiBasicData(
        val id: String,
        val title: String
    )

    fun getWithSunreis(tagId: String): TagWithSunreisData? = transaction {
        val tag = Tags.select { Tags.id eq tagId }.singleOrNull()?.let { row ->
            Tag(
                id = row[Tags.id],
                name = row[Tags.name],
                description = row[Tags.description]
            )
        } ?: return@transaction null

        val sunreis = SunreiTags
            .innerJoin(Sunreis, { SunreiTags.sunreiId }, { Sunreis.id })
            .select { SunreiTags.tagId eq tagId }
            .map { row ->
                SunreiBasicData(
                    id = row[Sunreis.id],
                    title = row[Sunreis.title]
                )
            }

        TagWithSunreisData(
            tag = tag,
            sunreis = sunreis
        )
    }

    fun removeSunreiFromTag(tagId: String, sunreiId: String): Boolean = transaction {
        val deleted = SunreiTags.deleteWhere {
            (SunreiTags.tagId eq tagId) and (SunreiTags.sunreiId eq sunreiId)
        }
        deleted > 0
    }
}