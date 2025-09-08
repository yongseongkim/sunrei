package com.sunrei.service

import com.sunrei.generated.dto.admin.ImageDTO
import com.sunrei.generated.dto.admin.ListSunreisResult
import com.sunrei.generated.dto.admin.PlaceDTO
import com.sunrei.generated.dto.admin.SunreiDTO
import com.sunrei.generated.dto.admin.SunreiSpotDTO
import com.sunrei.generated.dto.admin.TagDTO
import com.sunrei.model.Places
import com.sunrei.model.SunreiSpots
import com.sunrei.model.SunreiTags
import com.sunrei.model.Sunreis
import com.sunrei.model.Tags
import com.sunrei.config.JwtConfig
import com.sunrei.utils.PaginationToken
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction

class AdminSunreiService {
    private val pageToken = PaginationToken(JwtConfig.getPageTokenSecret())
    
    fun list(nextToken: String? = null, size: Int = 20, search: String? = null): ListSunreisResult {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size
        
        return transaction {
            var query = Sunreis.selectAll()
            
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
                        images = row[Sunreis.images].map { img ->
                            ImageDTO(
                                url = img.url,
                                width = img.width,
                                height = img.height,
                            )
                        },
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
            .select { SunreiSpots.sunreiId eq sunreiId }
            .map { row ->
                SunreiSpotDTO(
                    id = row[SunreiSpots.id],
                    sunreiId = sunreiId,
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
                    place = PlaceDTO(
                        id = row[Places.id],
                        name = row[Places.name],
                        address = row[Places.address],
                        latitude = row[Places.latitude],
                        longitude = row[Places.longitude]
                    )
                )
            }
    }

    fun findOne(id: String): SunreiDTO? = transaction {
        Sunreis.select { Sunreis.id eq id }
            .firstOrNull()?.let { row ->
                val sunreiId = row[Sunreis.id]
                val spots = fetchSpotsForSunrei(sunreiId)
                val tags = fetchTagsForSunrei(sunreiId)
                
                SunreiDTO(
                    id = sunreiId,
                    title = row[Sunreis.title],
                    description = row[Sunreis.description],
                    link = row[Sunreis.link],
                    images = row[Sunreis.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
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
}