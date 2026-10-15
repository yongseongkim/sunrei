package com.sunrei.service

import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.database.YoutubeExtractedPlaces
import com.sunrei.database.YoutubeExtractionRuns
import com.sunrei.database.YoutubePlaylistVideos
import com.sunrei.database.YoutubePlaylists
import com.sunrei.database.YoutubeVideoAttempts
import com.sunrei.database.YoutubeVideoTexts
import com.sunrei.database.YoutubeVideos
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.CreateYoutubeExtractionRunRequest
import com.sunrei.generated.dto.admin.CreateYoutubeVideoTextRequest
import com.sunrei.generated.dto.admin.ListYoutubeExtractedPlacesResult
import com.sunrei.generated.dto.admin.ListYoutubePlaylistsResult
import com.sunrei.generated.dto.admin.ListYoutubeVideosResult
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.ReviewYoutubeExtractedPlaceRequest
import com.sunrei.generated.dto.admin.SyncYoutubePlaylistVideosRequest
import com.sunrei.generated.dto.admin.SyncYoutubePlaylistVideosResult
import com.sunrei.generated.dto.admin.UpdateYoutubeVideoRequest
import com.sunrei.generated.dto.admin.UpsertYoutubePlaylistRequest
import com.sunrei.generated.dto.admin.YoutubeConfidence
import com.sunrei.generated.dto.admin.YoutubeEvidenceDTO
import com.sunrei.generated.dto.admin.YoutubeExtractedPlaceDTO
import com.sunrei.generated.dto.admin.YoutubeExtractionRunDTO
import com.sunrei.generated.dto.admin.YoutubeExtractionRunStatus
import com.sunrei.generated.dto.admin.YoutubePlaylistDTO
import com.sunrei.generated.dto.admin.YoutubeReviewStatus
import com.sunrei.generated.dto.admin.YoutubeSegmentDTO
import com.sunrei.generated.dto.admin.YoutubeTextKind
import com.sunrei.generated.dto.admin.YoutubeVideoAttemptDTO
import com.sunrei.generated.dto.admin.YoutubeVideoDTO
import com.sunrei.generated.dto.admin.YoutubeVideoDetailDTO
import com.sunrei.generated.dto.admin.YoutubeVideoStatus
import com.sunrei.generated.dto.admin.YoutubeVideoTextDTO
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class NotFoundException(message: String) : RuntimeException(message)

class YoutubeService(
    private val sunreiService: SunreiService,
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)
    private val json = Json { ignoreUnknownKeys = true }

    // ===== Playlists =====

    fun listPlaylists(): ListYoutubePlaylistsResult = transaction {
        val rows = YoutubePlaylists.selectAll().orderBy(YoutubePlaylists.createdAt to SortOrder.ASC).toList()
        ListYoutubePlaylistsResult(data = rows.map { it.toPlaylistDTO() })
    }

    fun getPlaylist(id: String): YoutubePlaylistDTO? = transaction {
        YoutubePlaylists.select { YoutubePlaylists.id eq id }.firstOrNull()?.toPlaylistDTO()
    }

    fun upsertPlaylist(id: String, request: UpsertYoutubePlaylistRequest): YoutubePlaylistDTO = transaction {
        require(id.isNotBlank()) { "Playlist id must not be empty" }
        request.sunreiId?.let { requireSunreiExists(it) }
        val now = Clock.System.now()
        val exists = YoutubePlaylists.select { YoutubePlaylists.id eq id }.count() > 0

        if (exists) {
            YoutubePlaylists.update({ YoutubePlaylists.id eq id }) { stmt ->
                stmt[title] = request.title
                request.description?.let { stmt[description] = it }
                request.channelId?.let { stmt[channelId] = it }
                request.channelTitle?.let { stmt[channelTitle] = it }
                request.sunreiId?.let { stmt[sunreiId] = it }
                request.syncEnabled?.let { stmt[syncEnabled] = it }
                stmt[updatedAt] = now
            }
        } else {
            YoutubePlaylists.insert { stmt ->
                stmt[YoutubePlaylists.id] = id
                stmt[title] = request.title
                stmt[description] = request.description
                stmt[channelId] = request.channelId
                stmt[channelTitle] = request.channelTitle
                stmt[sunreiId] = request.sunreiId
                stmt[syncEnabled] = request.syncEnabled ?: true
                stmt[createdAt] = now
                stmt[updatedAt] = now
            }
        }
        YoutubePlaylists.select { YoutubePlaylists.id eq id }.first().toPlaylistDTO()
    }

    /**
     * Upsert the playlist's current videos, mark missing ones as removed, and
     * return the videos still waiting for processing.
     */
    fun syncPlaylistVideos(playlistId: String, request: SyncYoutubePlaylistVideosRequest): SyncYoutubePlaylistVideosResult =
        transaction {
            YoutubePlaylists.select { YoutubePlaylists.id eq playlistId }.firstOrNull()
                ?: throw NotFoundException("Playlist not found")
            val now = Clock.System.now()
            val initialStatus = (request.initialStatus ?: YoutubeVideoStatus.PENDING).name

            val memberships = YoutubePlaylistVideos.select { YoutubePlaylistVideos.playlistId eq playlistId }
                .associateBy { it[YoutubePlaylistVideos.videoId] }
            // 같은 영상이 플레이리스트에 두 번 들어 있을 수 있어서 첫 위치만 쓴다.
            val videos = request.videos.distinctBy { it.id }
            val remoteIds = videos.map { it.id }.toSet()
            val existingVideoIds = if (remoteIds.isEmpty()) emptySet() else
                YoutubeVideos.select { YoutubeVideos.id inList remoteIds }.map { it[YoutubeVideos.id] }.toSet()

            val added = mutableListOf<String>()
            videos.forEach { video ->
                if (video.id in existingVideoIds) {
                    YoutubeVideos.update({ YoutubeVideos.id eq video.id }) { stmt ->
                        stmt[title] = video.title.take(255)
                        video.description?.let { stmt[description] = it }
                        video.channelId?.let { stmt[channelId] = it }
                        video.channelTitle?.let { stmt[channelTitle] = it }
                        video.publishedAt?.let { stmt[publishedAt] = it }
                        video.durationSeconds?.let { stmt[durationSeconds] = it }
                        video.thumbnailUrl?.let { stmt[thumbnailUrl] = it }
                        stmt[updatedAt] = now
                    }
                } else {
                    YoutubeVideos.insert { stmt ->
                        stmt[id] = video.id
                        stmt[title] = video.title.take(255)
                        stmt[description] = video.description
                        stmt[channelId] = video.channelId
                        stmt[channelTitle] = video.channelTitle
                        stmt[publishedAt] = video.publishedAt
                        stmt[durationSeconds] = video.durationSeconds
                        stmt[thumbnailUrl] = video.thumbnailUrl
                        stmt[status] = initialStatus
                        stmt[createdAt] = now
                        stmt[updatedAt] = now
                    }
                }

                val membership = memberships[video.id]
                if (membership == null) {
                    YoutubePlaylistVideos.insert { stmt ->
                        stmt[YoutubePlaylistVideos.playlistId] = playlistId
                        stmt[videoId] = video.id
                        stmt[position] = video.position
                        stmt[firstSeenAt] = now
                    }
                    added += video.id
                } else {
                    YoutubePlaylistVideos.update({
                        (YoutubePlaylistVideos.playlistId eq playlistId) and (YoutubePlaylistVideos.videoId eq video.id)
                    }) { stmt ->
                        stmt[position] = video.position
                        stmt[removedAt] = null
                    }
                }
            }

            val removed = memberships.values
                .filter { it[YoutubePlaylistVideos.removedAt] == null && it[YoutubePlaylistVideos.videoId] !in remoteIds }
                .map { it[YoutubePlaylistVideos.videoId] }
            if (removed.isNotEmpty()) {
                YoutubePlaylistVideos.update({
                    (YoutubePlaylistVideos.playlistId eq playlistId) and (YoutubePlaylistVideos.videoId inList removed)
                }) { it[removedAt] = now }
            }

            YoutubePlaylists.update({ YoutubePlaylists.id eq playlistId }) { it[lastSyncedAt] = now }

            val pending = (YoutubeVideos innerJoin YoutubePlaylistVideos)
                .select {
                    (YoutubePlaylistVideos.playlistId eq playlistId) and
                        YoutubePlaylistVideos.removedAt.isNull() and
                        (YoutubeVideos.status inList PROCESSABLE_STATUSES)
                }
                .orderBy(YoutubePlaylistVideos.position to SortOrder.ASC_NULLS_LAST)
                .map { it.toVideoDTO() }

            SyncYoutubePlaylistVideosResult(addedVideoIds = added, removedVideoIds = removed, pendingVideos = pending)
        }

    // ===== Videos =====

    fun listVideos(
        playlistId: String?,
        status: YoutubeVideoStatus?,
        nextToken: String?,
        size: Int
    ): ListYoutubeVideosResult = transaction {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        val query = if (playlistId != null) {
            (YoutubeVideos innerJoin YoutubePlaylistVideos).select {
                (YoutubePlaylistVideos.playlistId eq playlistId) and YoutubePlaylistVideos.removedAt.isNull()
            }
        } else {
            YoutubeVideos.selectAll()
        }
        status?.let { query.andWhere { YoutubeVideos.status eq it.name } }

        val totalElements = query.count().toInt()
        val videos = query
            .orderBy(YoutubeVideos.publishedAt to SortOrder.DESC_NULLS_LAST, YoutubeVideos.id to SortOrder.ASC)
            .limit(effectiveSize, offset.toLong())
            .map { it.toVideoDTO() }

        ListYoutubeVideosResult(
            data = videos,
            totalSize = videos.size,
            totalElements = totalElements,
            nextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)
        )
    }

    fun getVideoDetail(videoId: String): YoutubeVideoDetailDTO? = transaction {
        val video = YoutubeVideos.select { YoutubeVideos.id eq videoId }.firstOrNull()?.toVideoDTO()
            ?: return@transaction null
        val playlistIds = YoutubePlaylistVideos
            .select { (YoutubePlaylistVideos.videoId eq videoId) and YoutubePlaylistVideos.removedAt.isNull() }
            .map { it[YoutubePlaylistVideos.playlistId] }
        val texts = YoutubeVideoTexts.select { YoutubeVideoTexts.videoId eq videoId }
            .orderBy(YoutubeVideoTexts.createdAt to SortOrder.DESC)
            .map { it.toTextDTO(includeSegments = false) }
        val runRows = YoutubeExtractionRuns.select { YoutubeExtractionRuns.videoId eq videoId }
            .orderBy(YoutubeExtractionRuns.createdAt to SortOrder.DESC)
            .toList()
        val placesByRun = placeDTOs(YoutubeExtractedPlaces.runId inList runRows.map { it[YoutubeExtractionRuns.id] })
            .groupBy { it.runId }
        val attempts = YoutubeVideoAttempts.select { YoutubeVideoAttempts.videoId eq videoId }
            .orderBy(YoutubeVideoAttempts.createdAt to SortOrder.DESC)
            .limit(50)
            .map {
                YoutubeVideoAttemptDTO(
                    id = it[YoutubeVideoAttempts.id],
                    stage = it[YoutubeVideoAttempts.stage],
                    error = it[YoutubeVideoAttempts.error],
                    createdAt = it[YoutubeVideoAttempts.createdAt]
                )
            }

        YoutubeVideoDetailDTO(
            video = video,
            playlistIds = playlistIds,
            texts = texts,
            runs = runRows.map { it.toRunDTO(placesByRun[it[YoutubeExtractionRuns.id]].orEmpty()) },
            attempts = attempts
        )
    }

    fun updateVideo(videoId: String, request: UpdateYoutubeVideoRequest): YoutubeVideoDTO? = transaction {
        YoutubeVideos.select { YoutubeVideos.id eq videoId }.firstOrNull() ?: return@transaction null
        val now = Clock.System.now()

        YoutubeVideos.update({ YoutubeVideos.id eq videoId }) { stmt ->
            request.status?.let {
                stmt[status] = it.name
                if (it == YoutubeVideoStatus.REVIEW_PENDING || it == YoutubeVideoStatus.COMPLETED) stmt[processedAt] = now
            }
            request.stage?.let { stmt[stage] = it }
            request.error?.let { stmt[error] = it.ifEmpty { null } }
            stmt[updatedAt] = now
        }

        request.error?.takeIf { it.isNotEmpty() }?.let { message ->
            YoutubeVideoAttempts.insertAndGetId { stmt ->
                stmt[YoutubeVideoAttempts.videoId] = videoId
                stmt[stage] = request.stage ?: "unknown"
                stmt[error] = message
                stmt[createdAt] = now
            }
        }

        YoutubeVideos.select { YoutubeVideos.id eq videoId }.first().toVideoDTO()
    }

    // ===== Texts =====

    fun createText(videoId: String, request: CreateYoutubeVideoTextRequest): YoutubeVideoTextDTO = transaction {
        requireVideoExists(videoId)
        val id = YoutubeVideoTexts.insertAndGetId { stmt ->
            stmt[YoutubeVideoTexts.videoId] = videoId
            stmt[kind] = request.kind.name
            stmt[language] = request.language
            stmt[segments] = json.encodeToJsonElement(SEGMENTS, request.segments.orEmpty())
            stmt[fullText] = request.fullText
            stmt[payload] = request.payload?.let(::parseJson)
            stmt[params] = request.params?.let(::parseJson)
            stmt[createdAt] = Clock.System.now()
        }
        YoutubeVideoTexts.select { YoutubeVideoTexts.id eq id }.first().toTextDTO(includeSegments = false)
    }

    fun getText(id: String): YoutubeVideoTextDTO? = transaction {
        YoutubeVideoTexts.select { YoutubeVideoTexts.id eq id }.firstOrNull()?.toTextDTO(includeSegments = true)
    }

    // ===== Extraction runs =====

    fun createRun(videoId: String, request: CreateYoutubeExtractionRunRequest): YoutubeExtractionRunDTO = transaction {
        requireVideoExists(videoId)
        val now = Clock.System.now()
        val runId = YoutubeExtractionRuns.insertAndGetId { stmt ->
            stmt[YoutubeExtractionRuns.videoId] = videoId
            stmt[agent] = request.agent
            stmt[model] = request.model
            stmt[promptSha256] = request.promptSha256
            stmt[inputTextIds] = request.inputTextIds.orEmpty()
            stmt[status] = request.status.name
            stmt[rawOutput] = request.rawOutput?.let(::parseJson)
            stmt[error] = request.error
            stmt[startedAt] = request.startedAt
            stmt[finishedAt] = request.finishedAt
            stmt[createdAt] = now
        }

        request.places.orEmpty().forEach { place ->
            // 이미 SunreiSpot으로 만들어진 후보는 승인된 상태로 저장한다.
            val spotId = place.sunreiSpotId?.also(::requireSpotExists)
            YoutubeExtractedPlaces.insertAndGetId { stmt ->
                stmt[YoutubeExtractedPlaces.runId] = runId
                stmt[YoutubeExtractedPlaces.videoId] = videoId
                stmt[name] = place.name.take(255)
                stmt[aliases] = place.aliases.orEmpty()
                stmt[category] = place.category?.take(64)
                stmt[area] = place.area?.take(255)
                stmt[description] = place.description
                stmt[evidence] = json.encodeToJsonElement(EVIDENCE, place.evidence.orEmpty())
                stmt[confidence] = place.confidence?.name
                stmt[needsVerification] = place.needsVerification ?: false
                stmt[reason] = place.reason
                stmt[timestampSeconds] = place.timestampSeconds
                place.place?.let { geo ->
                    stmt[placeName] = geo.name.take(128)
                    stmt[address] = geo.address.take(255)
                    stmt[latitude] = geo.latitude
                    stmt[longitude] = geo.longitude
                    stmt[googleMapsId] = geo.googleMapsId
                }
                stmt[geocodeWarning] = place.geocodeWarning
                stmt[reviewStatus] = (if (spotId != null) YoutubeReviewStatus.APPROVED else YoutubeReviewStatus.PENDING).name
                stmt[reviewedAt] = spotId?.let { now }
                stmt[sunreiSpotId] = spotId
                stmt[createdAt] = now
                stmt[updatedAt] = now
            }
        }

        val row = YoutubeExtractionRuns.select { YoutubeExtractionRuns.id eq runId }.first()
        row.toRunDTO(placeDTOs(YoutubeExtractedPlaces.runId eq runId))
    }

    // ===== Extracted places =====

    fun listPlaces(
        reviewStatus: YoutubeReviewStatus?,
        playlistId: String?,
        videoId: String?,
        nextToken: String?,
        size: Int
    ): ListYoutubeExtractedPlacesResult = transaction {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        var condition: Op<Boolean> = Op.TRUE
        reviewStatus?.let { condition = condition and (YoutubeExtractedPlaces.reviewStatus eq it.name) }
        videoId?.let { condition = condition and (YoutubeExtractedPlaces.videoId eq it) }
        playlistId?.let { id ->
            val videoIds = YoutubePlaylistVideos.select { YoutubePlaylistVideos.playlistId eq id }
                .map { it[YoutubePlaylistVideos.videoId] }
            condition = condition and (YoutubeExtractedPlaces.videoId inList videoIds)
        }

        val totalElements = YoutubeExtractedPlaces.select { condition }.count().toInt()
        val places = placeDTOs(condition, limit = effectiveSize, offset = offset.toLong())

        ListYoutubeExtractedPlacesResult(
            data = places,
            totalSize = places.size,
            totalElements = totalElements,
            nextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)
        )
    }

    /**
     * Apply a review decision. APPROVED adds a SunreiSpot to the target playlist's Sunrei.
     */
    fun reviewPlace(id: String, request: ReviewYoutubeExtractedPlaceRequest): YoutubeExtractedPlaceDTO? = transaction {
        val row = YoutubeExtractedPlaces.select { YoutubeExtractedPlaces.id eq id }.firstOrNull()
            ?: return@transaction null
        if (row[YoutubeExtractedPlaces.sunreiSpotId] != null) {
            throw ConflictException("Place is already approved", row[YoutubeExtractedPlaces.sunreiSpotId]!!)
        }
        val videoId = row[YoutubeExtractedPlaces.videoId]
        val now = Clock.System.now()

        var spotId: String? = null
        if (request.reviewStatus == YoutubeReviewStatus.APPROVED) {
            val sunreiId = resolveTargetSunrei(videoId, request.playlistId)
            val place = request.place ?: row.suggestedPlace()
                ?: throw IllegalArgumentException("A geocoded place is required for approval")
            val video = YoutubeVideos.select { YoutubeVideos.id eq videoId }.first()
            val timestamp = row[YoutubeExtractedPlaces.timestampSeconds]
            spotId = sunreiService.addSpot(
                sunreiId,
                CreateSunreiSpotInline(
                    title = (request.title ?: video[YoutubeVideos.title]).take(128),
                    context = request.context ?: row[YoutubeExtractedPlaces.description],
                    sourceLink = "https://www.youtube.com/watch?v=$videoId" + (timestamp?.let { "&t=$it" } ?: ""),
                    place = place,
                    tagIds = request.tagIds
                )
            )
        }

        YoutubeExtractedPlaces.update({ YoutubeExtractedPlaces.id eq id }) { stmt ->
            stmt[reviewStatus] = request.reviewStatus.name
            stmt[reviewedAt] = if (request.reviewStatus == YoutubeReviewStatus.PENDING) null else now
            stmt[sunreiSpotId] = spotId
            request.place?.let { geo ->
                stmt[placeName] = geo.name.take(128)
                stmt[address] = geo.address.take(255)
                stmt[latitude] = geo.latitude
                stmt[longitude] = geo.longitude
                stmt[googleMapsId] = geo.googleMapsId
            }
            stmt[updatedAt] = now
        }

        completeVideoWhenReviewed(videoId, now)
        placeDTOs(YoutubeExtractedPlaces.id eq id).first()
    }

    // ===== Helpers =====

    private fun resolveTargetSunrei(videoId: String, playlistId: String?): String {
        val candidates = (YoutubePlaylistVideos innerJoin YoutubePlaylists)
            .select { YoutubePlaylistVideos.videoId eq videoId }
            .filter { playlistId == null || it[YoutubePlaylists.id] == playlistId }
        val sunreiId = candidates.firstNotNullOfOrNull { it[YoutubePlaylists.sunreiId] }
            ?: throw ConflictException("No Sunrei is linked to the video's playlist", playlistId ?: "")
        requireSunreiExists(sunreiId)
        return sunreiId
    }

    private fun completeVideoWhenReviewed(videoId: String, now: kotlinx.datetime.Instant) {
        val pending = YoutubeExtractedPlaces.select {
            (YoutubeExtractedPlaces.videoId eq videoId) and
                (YoutubeExtractedPlaces.reviewStatus eq YoutubeReviewStatus.PENDING.name)
        }.count()
        if (pending == 0L) {
            YoutubeVideos.update({
                (YoutubeVideos.id eq videoId) and (YoutubeVideos.status eq YoutubeVideoStatus.REVIEW_PENDING.name)
            }) { stmt ->
                stmt[status] = YoutubeVideoStatus.COMPLETED.name
                stmt[updatedAt] = now
            }
        }
    }

    private fun requireVideoExists(videoId: String) {
        if (YoutubeVideos.select { YoutubeVideos.id eq videoId }.count() == 0L) {
            throw NotFoundException("Video not found")
        }
    }

    private fun requireSunreiExists(sunreiId: String) {
        val exists = Sunreis.select { (Sunreis.id eq sunreiId) and Sunreis.deletedAt.isNull() }.count() > 0
        require(exists) { "Sunrei not found: $sunreiId" }
    }

    private fun requireSpotExists(spotId: String) {
        val exists = SunreiSpots.select { (SunreiSpots.id eq spotId) and SunreiSpots.deletedAt.isNull() }.count() > 0
        require(exists) { "Sunrei spot not found: $spotId" }
    }

    private fun parseJson(value: String): JsonElement = try {
        json.parseToJsonElement(value)
    } catch (e: Exception) {
        throw IllegalArgumentException("Invalid JSON: ${e.message}")
    }

    private fun placeDTOs(condition: Op<Boolean>, limit: Int? = null, offset: Long = 0): List<YoutubeExtractedPlaceDTO> {
        val query = (YoutubeExtractedPlaces innerJoin YoutubeVideos).select { condition }
            .orderBy(YoutubeExtractedPlaces.createdAt to SortOrder.ASC, YoutubeExtractedPlaces.id to SortOrder.ASC)
        limit?.let { query.limit(it, offset) }
        return query.map { it.toPlaceDTO() }
    }

    private fun ResultRow.toPlaylistDTO(): YoutubePlaylistDTO {
        val id = this[YoutubePlaylists.id]
        val members = (YoutubePlaylistVideos innerJoin YoutubeVideos).select {
            (YoutubePlaylistVideos.playlistId eq id) and YoutubePlaylistVideos.removedAt.isNull()
        }.map { it[YoutubeVideos.status] }
        return YoutubePlaylistDTO(
            id = id,
            title = this[YoutubePlaylists.title],
            description = this[YoutubePlaylists.description],
            channelId = this[YoutubePlaylists.channelId],
            channelTitle = this[YoutubePlaylists.channelTitle],
            sunreiId = this[YoutubePlaylists.sunreiId],
            syncEnabled = this[YoutubePlaylists.syncEnabled],
            lastSyncedAt = this[YoutubePlaylists.lastSyncedAt],
            videoCount = members.size,
            pendingVideoCount = members.count { it in PROCESSABLE_STATUSES },
            createdAt = this[YoutubePlaylists.createdAt],
            updatedAt = this[YoutubePlaylists.updatedAt]
        )
    }

    private fun ResultRow.toVideoDTO(): YoutubeVideoDTO = YoutubeVideoDTO(
        id = this[YoutubeVideos.id],
        title = this[YoutubeVideos.title],
        description = this[YoutubeVideos.description],
        channelId = this[YoutubeVideos.channelId],
        channelTitle = this[YoutubeVideos.channelTitle],
        publishedAt = this[YoutubeVideos.publishedAt],
        durationSeconds = this[YoutubeVideos.durationSeconds],
        thumbnailUrl = this[YoutubeVideos.thumbnailUrl],
        status = YoutubeVideoStatus.valueOf(this[YoutubeVideos.status]),
        stage = this[YoutubeVideos.stage],
        error = this[YoutubeVideos.error],
        processedAt = this[YoutubeVideos.processedAt],
        createdAt = this[YoutubeVideos.createdAt],
        updatedAt = this[YoutubeVideos.updatedAt]
    )

    private fun ResultRow.toTextDTO(includeSegments: Boolean): YoutubeVideoTextDTO {
        val segments = this[YoutubeVideoTexts.segments]
        return YoutubeVideoTextDTO(
            id = this[YoutubeVideoTexts.id],
            videoId = this[YoutubeVideoTexts.videoId],
            kind = YoutubeTextKind.valueOf(this[YoutubeVideoTexts.kind]),
            language = this[YoutubeVideoTexts.language],
            segmentCount = (segments as? JsonArray)?.size ?: 0,
            segments = if (includeSegments) json.decodeFromJsonElement(SEGMENTS, segments) else null,
            fullText = if (includeSegments) this[YoutubeVideoTexts.fullText] else null,
            payload = this[YoutubeVideoTexts.payload]?.toString(),
            params = this[YoutubeVideoTexts.params]?.toString(),
            createdAt = this[YoutubeVideoTexts.createdAt]
        )
    }

    private fun ResultRow.toRunDTO(places: List<YoutubeExtractedPlaceDTO>): YoutubeExtractionRunDTO = YoutubeExtractionRunDTO(
        id = this[YoutubeExtractionRuns.id],
        videoId = this[YoutubeExtractionRuns.videoId],
        agent = this[YoutubeExtractionRuns.agent],
        model = this[YoutubeExtractionRuns.model],
        promptSha256 = this[YoutubeExtractionRuns.promptSha256],
        inputTextIds = this[YoutubeExtractionRuns.inputTextIds],
        status = YoutubeExtractionRunStatus.valueOf(this[YoutubeExtractionRuns.status]),
        rawOutput = this[YoutubeExtractionRuns.rawOutput]?.toString(),
        error = this[YoutubeExtractionRuns.error],
        startedAt = this[YoutubeExtractionRuns.startedAt],
        finishedAt = this[YoutubeExtractionRuns.finishedAt],
        places = places,
        createdAt = this[YoutubeExtractionRuns.createdAt]
    )

    private fun ResultRow.suggestedPlace(): PlaceInput? {
        val lat = this[YoutubeExtractedPlaces.latitude] ?: return null
        val lng = this[YoutubeExtractedPlaces.longitude] ?: return null
        return PlaceInput(
            name = this[YoutubeExtractedPlaces.placeName] ?: this[YoutubeExtractedPlaces.name].take(128),
            address = this[YoutubeExtractedPlaces.address] ?: "",
            latitude = lat,
            longitude = lng,
            googleMapsId = this[YoutubeExtractedPlaces.googleMapsId]
        )
    }

    private fun ResultRow.toPlaceDTO(): YoutubeExtractedPlaceDTO = YoutubeExtractedPlaceDTO(
        id = this[YoutubeExtractedPlaces.id],
        runId = this[YoutubeExtractedPlaces.runId],
        videoId = this[YoutubeExtractedPlaces.videoId],
        videoTitle = this[YoutubeVideos.title],
        name = this[YoutubeExtractedPlaces.name],
        aliases = this[YoutubeExtractedPlaces.aliases],
        category = this[YoutubeExtractedPlaces.category],
        area = this[YoutubeExtractedPlaces.area],
        description = this[YoutubeExtractedPlaces.description],
        evidence = json.decodeFromJsonElement(EVIDENCE, this[YoutubeExtractedPlaces.evidence]),
        confidence = this[YoutubeExtractedPlaces.confidence]?.let { YoutubeConfidence.valueOf(it) },
        needsVerification = this[YoutubeExtractedPlaces.needsVerification],
        reason = this[YoutubeExtractedPlaces.reason],
        timestampSeconds = this[YoutubeExtractedPlaces.timestampSeconds],
        place = suggestedPlace(),
        geocodeWarning = this[YoutubeExtractedPlaces.geocodeWarning],
        reviewStatus = YoutubeReviewStatus.valueOf(this[YoutubeExtractedPlaces.reviewStatus]),
        reviewedAt = this[YoutubeExtractedPlaces.reviewedAt],
        sunreiSpotId = this[YoutubeExtractedPlaces.sunreiSpotId],
        createdAt = this[YoutubeExtractedPlaces.createdAt]
    )

    companion object {
        /** Videos the collection job should (re)process. */
        private val PROCESSABLE_STATUSES = listOf(YoutubeVideoStatus.PENDING.name, YoutubeVideoStatus.FAILED.name)
        private val SEGMENTS = ListSerializer(YoutubeSegmentDTO.serializer())
        private val EVIDENCE = ListSerializer(YoutubeEvidenceDTO.serializer())
    }
}
