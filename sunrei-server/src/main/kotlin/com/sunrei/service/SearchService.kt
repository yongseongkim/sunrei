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

    /** Sunrei DB에 없는 지역 검색은 클라이언트가 Google Places 자동완성 결과로 채운다. */
    fun search(q: String, centerLat: Double?, centerLng: Double?): SearchResult = transaction {
        val term = "%${q.lowercase()}%"

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

        val sunreiRows = (Sunreis innerJoin Sources)
            .select {
                (Sunreis.deletedAt.isNull()) and (Sunreis.publishedAt.isNotNull()) and
                    ((Sunreis.title.lowerCase() like term) or (Sunreis.summary.lowerCase() like term))
            }
            .orderBy(Sunreis.createdAt to SortOrder.DESC)
            .limit(20).toList()

        // 저장된 이미지가 없는 Sunrei는 첫 spot의 YouTube 썸네일을 대신 쓴다.
        // 시리즈 Sunrei의 link는 플레이리스트라 썸네일을 하나로 정할 수 없지만, spot은 개별 영상 URL을 가진다.
        val needThumb = sunreiRows.filter { it[Sunreis.images].isEmpty() }.map { it[Sunreis.id] }
        val thumbBySunrei: Map<String, MultiSizeImageDTO> = if (needThumb.isNotEmpty()) {
            SunreiSpots
                .slice(SunreiSpots.sunreiId, SunreiSpots.sourceLink, SunreiSpots.id)
                .select {
                    (SunreiSpots.sunreiId inList needThumb) and (SunreiSpots.deletedAt.isNull()) and
                        (SunreiSpots.sourceLink.isNotNull())
                }
                .orderBy(SunreiSpots.id to SortOrder.ASC) // id가 ULID라 id 순으로 정렬하면 먼저 만든 spot이 앞에 온다.
                .toList()
                .groupBy { it[SunreiSpots.sunreiId] }
                .mapNotNull { (sid, spots) ->
                    spots.firstNotNullOfOrNull { youtubeThumbnail(it[SunreiSpots.sourceLink]) }?.let { sid to it }
                }
                .toMap()
        } else emptyMap()

        val sunreis = sunreiRows.map { row ->
            val st = SourceType.valueOf(row[Sources.type])
            val stored = row[Sunreis.images].map { it.toAppImageDTO() }
            SunreiSummaryDTO(
                id = row[Sunreis.id],
                sourceId = row[Sunreis.sourceId],
                sourceName = row[Sources.name],
                sourceType = AppSourceType.valueOf(st.name),
                title = row[Sunreis.title],
                summary = row[Sunreis.summary],
                link = row[Sunreis.link],
                images = stored.ifEmpty { listOfNotNull(thumbBySunrei[row[Sunreis.id]]) },
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

// watch, youtu.be, embed, shorts 형식의 URL에서 영상 id를 뽑는다.
private val YOUTUBE_ID = Regex("""(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})""")

private fun youtubeThumbnail(link: String?): MultiSizeImageDTO? {
    val id = link?.let { YOUTUBE_ID.find(it)?.groupValues?.get(1) } ?: return null
    return MultiSizeImageDTO(
        listOf(ImageDTO(url = "https://i.ytimg.com/vi/$id/hqdefault.jpg", width = 480, height = 360))
    )
}
