package com.sunrei.service

import com.sunrei.database.InstagramAccounts
import com.sunrei.database.InstagramExtractedPlaces
import com.sunrei.database.InstagramExtractionRuns
import com.sunrei.database.InstagramPostAttempts
import com.sunrei.database.InstagramPostTexts
import com.sunrei.database.InstagramPosts
import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.database.insertAndGetId
import com.sunrei.generated.dto.admin.CreateInstagramExtractionRunRequest
import com.sunrei.generated.dto.admin.CreateInstagramPostTextRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.InstagramAccountDTO
import com.sunrei.generated.dto.admin.InstagramConfidence
import com.sunrei.generated.dto.admin.InstagramEvidenceDTO
import com.sunrei.generated.dto.admin.InstagramExtractedPlaceDTO
import com.sunrei.generated.dto.admin.InstagramExtractedPlaceInput
import com.sunrei.generated.dto.admin.InstagramExtractionRunDTO
import com.sunrei.generated.dto.admin.InstagramExtractionRunStatus
import com.sunrei.generated.dto.admin.InstagramGeocodeStatus
import com.sunrei.generated.dto.admin.InstagramLocationTagDTO
import com.sunrei.generated.dto.admin.InstagramMediaType
import com.sunrei.generated.dto.admin.InstagramPostAttemptDTO
import com.sunrei.generated.dto.admin.InstagramPostDTO
import com.sunrei.generated.dto.admin.InstagramPostDetailDTO
import com.sunrei.generated.dto.admin.InstagramPostStatus
import com.sunrei.generated.dto.admin.InstagramPostTextDTO
import com.sunrei.generated.dto.admin.InstagramPromotion
import com.sunrei.generated.dto.admin.InstagramReviewStatus
import com.sunrei.generated.dto.admin.InstagramSegmentDTO
import com.sunrei.generated.dto.admin.InstagramTextKind
import com.sunrei.generated.dto.admin.ListInstagramAccountsResult
import com.sunrei.generated.dto.admin.ListInstagramExtractedPlacesResult
import com.sunrei.generated.dto.admin.ListInstagramPostsResult
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.ReviewInstagramExtractedPlaceRequest
import com.sunrei.generated.dto.admin.SetInstagramLocationTagRequest
import com.sunrei.generated.dto.admin.UpdateInstagramPostRequest
import com.sunrei.generated.dto.admin.UpsertInstagramAccountRequest
import com.sunrei.generated.dto.admin.UpsertInstagramPostsRequest
import com.sunrei.generated.dto.admin.UpsertInstagramPostsResult
import com.sunrei.utils.PaginationToken
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.neq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class InstagramService(
    private val sunreiService: SunreiService,
    pageTokenSecret: String
) {
    private val pageToken = PaginationToken(pageTokenSecret)
    private val json = Json { ignoreUnknownKeys = true }

    fun listAccounts(): ListInstagramAccountsResult = transaction {
        val rows = InstagramAccounts.selectAll().orderBy(InstagramAccounts.createdAt to SortOrder.ASC).toList()
        val counts = postCounts(rows.map { it[InstagramAccounts.id] })
        ListInstagramAccountsResult(data = rows.map { it.toAccountDTO(counts) })
    }

    fun getAccount(id: String): InstagramAccountDTO? = transaction {
        InstagramAccounts.select { InstagramAccounts.id eq id }.firstOrNull()?.toAccountDTO(postCounts(listOf(id)))
    }

    fun upsertAccount(id: String, request: UpsertInstagramAccountRequest): InstagramAccountDTO = transaction {
        require(id.isNotEmpty() && id.length <= 32 && id.all { it.isDigit() }) {
            "Account id must be the numeric Instagram user ID"
        }
        val username = request.username.trim().removePrefix("@")
        require(username.isNotEmpty() && username.length <= 64) { "Username must be 1 to 64 characters" }
        request.sunreiId?.let { requireSunreiExists(it) }
        InstagramAccounts.select {
            (InstagramAccounts.username.lowerCase() eq username.lowercase()) and (InstagramAccounts.id neq id)
        }.firstOrNull()?.let {
            throw ConflictException("Username is already used by another account", it[InstagramAccounts.id])
        }
        val now = Clock.System.now()
        val completed = request.backfillCompleted == true
        val exists = InstagramAccounts.select { InstagramAccounts.id eq id }.count() > 0

        if (exists) {
            InstagramAccounts.update({ InstagramAccounts.id eq id }) { stmt ->
                stmt[InstagramAccounts.username] = username
                request.name?.let { stmt[InstagramAccounts.name] = it.take(255) }
                request.biography?.let { stmt[biography] = it }
                request.followersCount?.let { stmt[followersCount] = it }
                request.mediaCount?.let { stmt[mediaCount] = it }
                request.sunreiId?.let { stmt[sunreiId] = it }
                request.syncEnabled?.let { stmt[syncEnabled] = it }
                request.backfillCursor?.let { stmt[backfillCursor] = it }
                if (completed) {
                    stmt[backfillCursor] = null
                    stmt[backfillCompletedAt] = now
                }
                stmt[updatedAt] = now
            }
        } else {
            InstagramAccounts.insert { stmt ->
                stmt[InstagramAccounts.id] = id
                stmt[InstagramAccounts.username] = username
                stmt[InstagramAccounts.name] = request.name?.take(255)
                stmt[biography] = request.biography
                stmt[followersCount] = request.followersCount
                stmt[mediaCount] = request.mediaCount
                stmt[sunreiId] = request.sunreiId
                stmt[syncEnabled] = request.syncEnabled ?: true
                stmt[backfillCursor] = if (completed) null else request.backfillCursor
                stmt[backfillCompletedAt] = if (completed) now else null
                stmt[createdAt] = now
                stmt[updatedAt] = now
            }
        }
        InstagramAccounts.select { InstagramAccounts.id eq id }.first().toAccountDTO(postCounts(listOf(id)))
    }

    /**
     * 새 게시물은 넣고, 있는 게시물은 캡션·제목·수치만 갱신한다.
     * permalink가 하나라도 잘못되면 아무것도 쓰지 않는다.
     */
    fun upsertPosts(accountId: String, request: UpsertInstagramPostsRequest): UpsertInstagramPostsResult = transaction {
        InstagramAccounts.select { InstagramAccounts.id eq accountId }.firstOrNull()
            ?: throw NotFoundException("Account not found")
        require(request.posts.size <= MAX_POSTS_PER_UPSERT) { "At most $MAX_POSTS_PER_UPSERT posts per request" }

        val posts = request.posts.distinctBy { it.id }
        val shortcodes = posts.associate { post ->
            require(post.id.isNotBlank() && post.id.length <= 32) { "Invalid media id: ${post.id}" }
            require(post.permalink.length <= 255) { "Permalink is too long: ${post.permalink}" }
            val code = shortcodeOf(post.permalink)
                ?: throw IllegalArgumentException("Permalink has no post code: ${post.permalink}")
            post.id to code
        }
        val owners = if (posts.isEmpty()) emptyMap() else
            InstagramPosts.slice(InstagramPosts.id, InstagramPosts.accountId)
                .select { InstagramPosts.id inList posts.map { it.id } }
                .associate { it[InstagramPosts.id] to it[InstagramPosts.accountId] }
        owners.forEach { (postId, owner) ->
            require(owner == accountId) { "Post $postId belongs to another account" }
        }

        val now = Clock.System.now()
        val initialStatus = (request.initialStatus ?: InstagramPostStatus.PENDING).name
        val added = mutableListOf<String>()
        val updated = mutableListOf<String>()
        posts.forEach { post ->
            val title = captionTitle(post.caption) ?: shortcodes.getValue(post.id)
            if (post.id in owners) {
                // 캡션이 바뀌어도 이미 처리한 게시물을 다시 처리하지 않도록 상태는 그대로 둔다.
                InstagramPosts.update({ InstagramPosts.id eq post.id }) { stmt ->
                    stmt[caption] = post.caption
                    stmt[InstagramPosts.title] = title
                    post.productType?.let { stmt[productType] = it.take(16) }
                    post.likeCount?.let { stmt[likeCount] = it }
                    post.commentsCount?.let { stmt[commentsCount] = it }
                    stmt[updatedAt] = now
                }
                updated += post.id
            } else {
                InstagramPosts.insert { stmt ->
                    stmt[InstagramPosts.id] = post.id
                    stmt[InstagramPosts.accountId] = accountId
                    stmt[shortcode] = shortcodes.getValue(post.id)
                    stmt[permalink] = post.permalink
                    stmt[mediaType] = post.mediaType.name
                    stmt[productType] = post.productType?.take(16)
                    stmt[caption] = post.caption
                    stmt[InstagramPosts.title] = title
                    stmt[postedAt] = post.postedAt
                    stmt[likeCount] = post.likeCount
                    stmt[commentsCount] = post.commentsCount
                    stmt[status] = initialStatus
                    stmt[createdAt] = now
                    stmt[updatedAt] = now
                }
                added += post.id
            }
        }

        InstagramAccounts.update({ InstagramAccounts.id eq accountId }) { it[lastSyncedAt] = now }
        UpsertInstagramPostsResult(addedPostIds = added, updatedPostIds = updated)
    }

    fun listPosts(
        accountId: String?,
        status: InstagramPostStatus?,
        mediaType: InstagramMediaType?,
        locationTagRead: Boolean?,
        nextToken: String?,
        size: Int
    ): ListInstagramPostsResult = transaction {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        var condition: Op<Boolean> = Op.TRUE
        accountId?.let { condition = condition and (InstagramPosts.accountId eq it) }
        status?.let { condition = condition and (InstagramPosts.status eq it.name) }
        mediaType?.let { condition = condition and (InstagramPosts.mediaType eq it.name) }
        locationTagRead?.let { read ->
            condition = condition and
                (if (read) InstagramPosts.locationTagReadAt.isNotNull() else InstagramPosts.locationTagReadAt.isNull())
        }

        val totalElements = InstagramPosts.select { condition }.count().toInt()
        val posts = InstagramPosts.select { condition }
            .orderBy(InstagramPosts.postedAt to SortOrder.DESC, InstagramPosts.id to SortOrder.ASC)
            .limit(effectiveSize, offset.toLong())
            .map { it.toPostDTO() }

        ListInstagramPostsResult(
            data = posts,
            totalSize = posts.size,
            totalElements = totalElements,
            nextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)
        )
    }

    fun getPostDetail(postId: String): InstagramPostDetailDTO? = transaction {
        val post = InstagramPosts.select { InstagramPosts.id eq postId }.firstOrNull()?.toPostDTO()
            ?: return@transaction null
        val texts = InstagramPostTexts.select { InstagramPostTexts.postId eq postId }
            .orderBy(InstagramPostTexts.createdAt to SortOrder.DESC)
            .map { it.toTextDTO(includeSegments = false) }
        val runRows = InstagramExtractionRuns.select { InstagramExtractionRuns.postId eq postId }
            .orderBy(InstagramExtractionRuns.createdAt to SortOrder.DESC)
            .toList()
        val placesByRun = placeDTOs(InstagramExtractedPlaces.runId inList runRows.map { it[InstagramExtractionRuns.id] })
            .groupBy { it.runId }
        val attempts = InstagramPostAttempts.select { InstagramPostAttempts.postId eq postId }
            .orderBy(InstagramPostAttempts.createdAt to SortOrder.DESC)
            .limit(50)
            .map {
                InstagramPostAttemptDTO(
                    id = it[InstagramPostAttempts.id],
                    stage = it[InstagramPostAttempts.stage],
                    error = it[InstagramPostAttempts.error],
                    createdAt = it[InstagramPostAttempts.createdAt]
                )
            }

        InstagramPostDetailDTO(
            post = post,
            texts = texts,
            runs = runRows.map { it.toRunDTO(placesByRun[it[InstagramExtractionRuns.id]].orEmpty()) },
            attempts = attempts
        )
    }

    fun updatePost(postId: String, request: UpdateInstagramPostRequest): InstagramPostDTO? = transaction {
        InstagramPosts.select { InstagramPosts.id eq postId }.firstOrNull() ?: return@transaction null
        val now = Clock.System.now()

        InstagramPosts.update({ InstagramPosts.id eq postId }) { stmt ->
            request.status?.let {
                stmt[status] = it.name
                if (it == InstagramPostStatus.REVIEW_PENDING || it == InstagramPostStatus.COMPLETED) stmt[processedAt] = now
            }
            request.stage?.let { stmt[stage] = it.take(64) }
            request.error?.let { stmt[error] = it.ifEmpty { null } }
            stmt[updatedAt] = now
        }

        request.error?.takeIf { it.isNotEmpty() }?.let { message ->
            InstagramPostAttempts.insertAndGetId { stmt ->
                stmt[InstagramPostAttempts.postId] = postId
                stmt[stage] = (request.stage ?: "unknown").take(64)
                stmt[error] = message
                stmt[createdAt] = now
            }
        }

        InstagramPosts.select { InstagramPosts.id eq postId }.first().toPostDTO()
    }

    /** 게시물 페이지를 읽은 결과를 기록하며, 태그가 없으면 null로 남긴다. */
    fun setLocationTag(postId: String, request: SetInstagramLocationTagRequest): InstagramPostDTO? = transaction {
        InstagramPosts.select { InstagramPosts.id eq postId }.firstOrNull() ?: return@transaction null
        val now = Clock.System.now()
        InstagramPosts.update({ InstagramPosts.id eq postId }) { stmt ->
            stmt[locationTag] = request.locationTag?.let { json.encodeToJsonElement(InstagramLocationTagDTO.serializer(), it) }
            stmt[locationTagReadAt] = now
            stmt[updatedAt] = now
        }
        InstagramPosts.select { InstagramPosts.id eq postId }.first().toPostDTO()
    }

    fun createText(postId: String, request: CreateInstagramPostTextRequest): InstagramPostTextDTO = transaction {
        requirePostExists(postId)
        val id = InstagramPostTexts.insertAndGetId { stmt ->
            stmt[InstagramPostTexts.postId] = postId
            stmt[kind] = request.kind.name
            stmt[language] = request.language?.take(16)
            stmt[segments] = json.encodeToJsonElement(SEGMENTS, request.segments.orEmpty())
            stmt[fullText] = request.fullText
            stmt[params] = request.params?.let(::parseJson)
            stmt[createdAt] = Clock.System.now()
        }
        InstagramPostTexts.select { InstagramPostTexts.id eq id }.first().toTextDTO(includeSegments = false)
    }

    fun getText(id: String): InstagramPostTextDTO? = transaction {
        InstagramPostTexts.select { InstagramPostTexts.id eq id }.firstOrNull()?.toTextDTO(includeSegments = true)
    }

    /**
     * 게시물 하나의 추출 기록을 남긴다.
     * 성공한 기록은 홍보 분류를 게시물에 복사하고, 이전 실행의 대기 후보를 SUPERSEDED로 바꾼다.
     * 광고와 본인 홍보 글의 장소는 후보로 만들지 않고 raw output에만 남긴다.
     */
    fun createRun(postId: String, request: CreateInstagramExtractionRunRequest): InstagramExtractionRunDTO = transaction {
        requirePostExists(postId)
        request.batchId?.let { require(it.length <= 32) { "batchId must be at most 32 characters" } }
        val succeeded = request.status == InstagramExtractionRunStatus.SUCCEEDED
        require(succeeded || request.places.isNullOrEmpty()) { "A failed run cannot have places" }
        val now = Clock.System.now()

        val runId = InstagramExtractionRuns.insertAndGetId { stmt ->
            stmt[InstagramExtractionRuns.postId] = postId
            stmt[batchId] = request.batchId
            stmt[agent] = request.agent.take(32)
            stmt[model] = request.model?.take(64)
            stmt[promptSha256] = request.promptSha256?.take(64)
            stmt[inputTextIds] = request.inputTextIds.orEmpty()
            stmt[status] = request.status.name
            stmt[promotion] = request.promotion?.name
            stmt[promotionEvidence] = request.promotionEvidence
            stmt[rawOutput] = request.rawOutput?.let(::parseJson)
            stmt[error] = request.error
            stmt[startedAt] = request.startedAt
            stmt[finishedAt] = request.finishedAt
            stmt[createdAt] = now
        }

        if (succeeded) {
            InstagramPosts.update({ InstagramPosts.id eq postId }) { stmt ->
                stmt[promotion] = request.promotion?.name
                stmt[promotionEvidence] = request.promotionEvidence
                stmt[updatedAt] = now
            }
            // 재추출하면 이전 실행의 대기 후보를 정리해서 검토 목록이 두 배가 되지 않게 한다.
            InstagramExtractedPlaces.update({
                (InstagramExtractedPlaces.postId eq postId) and
                    (InstagramExtractedPlaces.reviewStatus eq InstagramReviewStatus.PENDING.name) and
                    (InstagramExtractedPlaces.runId neq runId)
            }) { stmt ->
                stmt[reviewStatus] = InstagramReviewStatus.SUPERSEDED.name
                stmt[reviewedAt] = now
                stmt[updatedAt] = now
            }
            if (request.promotion !in NO_CANDIDATE_PROMOTIONS) {
                request.places.orEmpty().forEach { insertCandidate(runId, postId, it, now) }
            }
        }

        val row = InstagramExtractionRuns.select { InstagramExtractionRuns.id eq runId }.first()
        row.toRunDTO(placeDTOs(InstagramExtractedPlaces.runId eq runId))
    }

    private fun insertCandidate(runId: String, postId: String, place: InstagramExtractedPlaceInput, now: Instant) {
        val nameFound = place.nameFound ?: true
        // 상호가 없으면 지도 검색 결과가 와도 근처 아무 가게일 수 있어서 버린다.
        val geocodeStatus = when {
            !nameFound -> InstagramGeocodeStatus.NOT_SEARCHED
            else -> place.geocodeStatus ?: if (place.place != null) InstagramGeocodeStatus.MATCHED else InstagramGeocodeStatus.NOT_SEARCHED
        }
        val geo = place.place.takeIf { geocodeStatus in GEOCODED_STATUSES }
        require(geocodeStatus !in GEOCODED_STATUSES || geo != null) { "geocodeStatus $geocodeStatus needs a place" }
        val spotId = place.sunreiSpotId?.also(::requireSpotExists)

        InstagramExtractedPlaces.insertAndGetId { stmt ->
            stmt[InstagramExtractedPlaces.runId] = runId
            stmt[InstagramExtractedPlaces.postId] = postId
            stmt[name] = place.name.take(255)
            stmt[InstagramExtractedPlaces.nameFound] = nameFound
            stmt[aliases] = place.aliases.orEmpty()
            stmt[category] = place.category?.take(64)
            stmt[area] = place.area?.take(255)
            stmt[description] = place.description
            stmt[evidence] = json.encodeToJsonElement(EVIDENCE, place.evidence.orEmpty())
            stmt[confidence] = place.confidence?.name
            stmt[needsVerification] = place.needsVerification ?: !nameFound
            stmt[reason] = place.reason
            stmt[InstagramExtractedPlaces.geocodeStatus] = geocodeStatus.name
            geo?.let {
                stmt[placeName] = it.name.take(128)
                stmt[address] = it.address.take(255)
                stmt[latitude] = it.latitude
                stmt[longitude] = it.longitude
                stmt[googleMapsId] = it.googleMapsId
            }
            stmt[geocodeWarning] = place.geocodeWarning
            stmt[reviewStatus] = (if (spotId != null) InstagramReviewStatus.APPROVED else InstagramReviewStatus.PENDING).name
            stmt[reviewedAt] = spotId?.let { now }
            stmt[sunreiSpotId] = spotId
            stmt[createdAt] = now
            stmt[updatedAt] = now
        }
    }

    fun listPlaces(
        reviewStatus: InstagramReviewStatus?,
        geocodeStatus: InstagramGeocodeStatus?,
        accountId: String?,
        postId: String?,
        nextToken: String?,
        size: Int
    ): ListInstagramExtractedPlacesResult = transaction {
        val tokenData = pageToken.decodeToken(nextToken)
        val offset = tokenData?.offset ?: 0
        val effectiveSize = tokenData?.size ?: size

        var condition: Op<Boolean> = Op.TRUE
        reviewStatus?.let { condition = condition and (InstagramExtractedPlaces.reviewStatus eq it.name) }
        geocodeStatus?.let { condition = condition and (InstagramExtractedPlaces.geocodeStatus eq it.name) }
        postId?.let { condition = condition and (InstagramExtractedPlaces.postId eq it) }
        accountId?.let { condition = condition and (InstagramPosts.accountId eq it) }

        val totalElements = (InstagramExtractedPlaces innerJoin InstagramPosts).select { condition }.count().toInt()
        val places = placeDTOs(condition, limit = effectiveSize, offset = offset.toLong())

        ListInstagramExtractedPlacesResult(
            data = places,
            totalSize = places.size,
            totalElements = totalElements,
            nextToken = pageToken.createNextPageToken(offset, effectiveSize, totalElements)
        )
    }

    /** 승인하면 계정의 Sunrei에 게시물 링크를 단 SunreiSpot을 추가한다. */
    fun reviewPlace(id: String, request: ReviewInstagramExtractedPlaceRequest): InstagramExtractedPlaceDTO? = transaction {
        require(request.reviewStatus != InstagramReviewStatus.SUPERSEDED) { "SUPERSEDED is set only by the server" }
        // 동시에 두 번 승인해도 spot이 하나만 생기도록 후보 행을 잠근다.
        val row = InstagramExtractedPlaces.select { InstagramExtractedPlaces.id eq id }.forUpdate().firstOrNull()
            ?: return@transaction null
        row[InstagramExtractedPlaces.sunreiSpotId]?.let { throw ConflictException("Place is already approved", it) }
        val postId = row[InstagramExtractedPlaces.postId]
        val post = InstagramPosts.select { InstagramPosts.id eq postId }.first()
        val now = Clock.System.now()

        var spotId: String? = null
        if (request.reviewStatus == InstagramReviewStatus.APPROVED) {
            val accountId = post[InstagramPosts.accountId]
            val sunreiId = InstagramAccounts.select { InstagramAccounts.id eq accountId }.first()[InstagramAccounts.sunreiId]
                ?.takeIf(::sunreiExists)
                ?: throw ConflictException("No Sunrei is linked to the post's account", accountId)
            val place = request.place ?: row.suggestedPlace()
                ?: throw IllegalArgumentException("A geocoded place is required for approval")
            spotId = sunreiService.addSpot(
                sunreiId,
                CreateSunreiSpotInline(
                    title = (request.title ?: post[InstagramPosts.title]).take(128),
                    context = request.context ?: row[InstagramExtractedPlaces.description],
                    sourceLink = post[InstagramPosts.permalink],
                    place = place,
                    tagIds = request.tagIds
                )
            )
        }

        InstagramExtractedPlaces.update({ InstagramExtractedPlaces.id eq id }) { stmt ->
            stmt[reviewStatus] = request.reviewStatus.name
            stmt[reviewedAt] = if (request.reviewStatus == InstagramReviewStatus.PENDING) null else now
            stmt[sunreiSpotId] = spotId
            request.place?.let { geo ->
                stmt[geocodeStatus] = InstagramGeocodeStatus.MATCHED.name
                stmt[placeName] = geo.name.take(128)
                stmt[address] = geo.address.take(255)
                stmt[latitude] = geo.latitude
                stmt[longitude] = geo.longitude
                stmt[googleMapsId] = geo.googleMapsId
            }
            stmt[updatedAt] = now
        }

        completePostWhenReviewed(postId, now)
        placeDTOs(InstagramExtractedPlaces.id eq id).first()
    }

    private fun completePostWhenReviewed(postId: String, now: Instant) {
        val pending = InstagramExtractedPlaces.select {
            (InstagramExtractedPlaces.postId eq postId) and
                (InstagramExtractedPlaces.reviewStatus eq InstagramReviewStatus.PENDING.name)
        }.count()
        if (pending == 0L) {
            InstagramPosts.update({
                (InstagramPosts.id eq postId) and (InstagramPosts.status eq InstagramPostStatus.REVIEW_PENDING.name)
            }) { stmt ->
                stmt[status] = InstagramPostStatus.COMPLETED.name
                stmt[processedAt] = now
                stmt[updatedAt] = now
            }
        }
    }

    /** 계정별 전체 게시물 수와 처리할(PENDING, FAILED) 게시물 수를 그룹 쿼리 두 번으로 센다. */
    private fun postCounts(accountIds: List<String>): Map<String, Pair<Int, Int>> {
        if (accountIds.isEmpty()) return emptyMap()
        val count = InstagramPosts.id.count()
        fun grouped(extra: Op<Boolean>): Map<String, Int> =
            InstagramPosts.slice(InstagramPosts.accountId, count)
                .select { (InstagramPosts.accountId inList accountIds) and extra }
                .groupBy(InstagramPosts.accountId)
                .associate { it[InstagramPosts.accountId] to it[count].toInt() }
        val totals = grouped(Op.TRUE)
        val pending = grouped(InstagramPosts.status inList PROCESSABLE_STATUSES)
        return accountIds.associateWith { (totals[it] ?: 0) to (pending[it] ?: 0) }
    }

    private fun requirePostExists(postId: String) {
        if (InstagramPosts.select { InstagramPosts.id eq postId }.count() == 0L) {
            throw NotFoundException("Post not found")
        }
    }

    private fun sunreiExists(sunreiId: String): Boolean =
        Sunreis.select { (Sunreis.id eq sunreiId) and Sunreis.deletedAt.isNull() }.count() > 0

    private fun requireSunreiExists(sunreiId: String) {
        require(sunreiExists(sunreiId)) { "Sunrei not found: $sunreiId" }
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

    private fun placeDTOs(condition: Op<Boolean>, limit: Int? = null, offset: Long = 0): List<InstagramExtractedPlaceDTO> {
        val query = (InstagramExtractedPlaces innerJoin InstagramPosts).select { condition }
            .orderBy(InstagramExtractedPlaces.createdAt to SortOrder.ASC, InstagramExtractedPlaces.id to SortOrder.ASC)
        limit?.let { query.limit(it, offset) }
        val rows = query.toList()
        val spots = existingSpots(rows)
        return rows.map { row ->
            val accountSunrei = spots.sunreiByAccount[row[InstagramPosts.accountId]]
            val mapsId = row[InstagramExtractedPlaces.googleMapsId]
            val others = if (accountSunrei == null || mapsId == null) emptyList() else
                spots.spotIds[accountSunrei to mapsId].orEmpty().filter { it != row[InstagramExtractedPlaces.sunreiSpotId] }
            row.toPlaceDTO(others)
        }
    }

    private class ExistingSpots(
        val sunreiByAccount: Map<String, String>,
        val spotIds: Map<Pair<String, String>, List<String>>
    )

    /** 후보 계정의 Sunrei에서 같은 Google 장소에 있는 spot을 페이지마다 쿼리 두 번으로 찾는다. */
    private fun existingSpots(rows: List<ResultRow>): ExistingSpots {
        val accountIds = rows.map { it[InstagramPosts.accountId] }.toSet()
        val mapsIds = rows.mapNotNull { it[InstagramExtractedPlaces.googleMapsId] }.toSet()
        if (accountIds.isEmpty() || mapsIds.isEmpty()) return ExistingSpots(emptyMap(), emptyMap())
        val sunreiByAccount = InstagramAccounts.slice(InstagramAccounts.id, InstagramAccounts.sunreiId)
            .select { InstagramAccounts.id inList accountIds }
            .mapNotNull { row -> row[InstagramAccounts.sunreiId]?.let { row[InstagramAccounts.id] to it } }
            .toMap()
        if (sunreiByAccount.isEmpty()) return ExistingSpots(emptyMap(), emptyMap())
        val spotIds = (SunreiSpots innerJoin Places)
            .slice(SunreiSpots.id, SunreiSpots.sunreiId, Places.googleMapsId)
            .select {
                (SunreiSpots.sunreiId inList sunreiByAccount.values.toSet()) and
                    (Places.googleMapsId inList mapsIds) and
                    SunreiSpots.deletedAt.isNull()
            }
            .groupBy({ it[SunreiSpots.sunreiId] to it[Places.googleMapsId]!! }, { it[SunreiSpots.id] })
        return ExistingSpots(sunreiByAccount, spotIds)
    }

    private fun ResultRow.toAccountDTO(counts: Map<String, Pair<Int, Int>>): InstagramAccountDTO {
        val id = this[InstagramAccounts.id]
        val (total, pending) = counts[id] ?: (0 to 0)
        return InstagramAccountDTO(
            id = id,
            username = this[InstagramAccounts.username],
            name = this[InstagramAccounts.name],
            biography = this[InstagramAccounts.biography],
            followersCount = this[InstagramAccounts.followersCount],
            mediaCount = this[InstagramAccounts.mediaCount],
            sunreiId = this[InstagramAccounts.sunreiId],
            syncEnabled = this[InstagramAccounts.syncEnabled],
            backfillCursor = this[InstagramAccounts.backfillCursor],
            backfillCompletedAt = this[InstagramAccounts.backfillCompletedAt],
            lastSyncedAt = this[InstagramAccounts.lastSyncedAt],
            postCount = total,
            pendingPostCount = pending,
            createdAt = this[InstagramAccounts.createdAt],
            updatedAt = this[InstagramAccounts.updatedAt]
        )
    }

    private fun ResultRow.toPostDTO(): InstagramPostDTO = InstagramPostDTO(
        id = this[InstagramPosts.id],
        accountId = this[InstagramPosts.accountId],
        shortcode = this[InstagramPosts.shortcode],
        permalink = this[InstagramPosts.permalink],
        mediaType = InstagramMediaType.valueOf(this[InstagramPosts.mediaType]),
        productType = this[InstagramPosts.productType],
        caption = this[InstagramPosts.caption],
        title = this[InstagramPosts.title],
        postedAt = this[InstagramPosts.postedAt],
        likeCount = this[InstagramPosts.likeCount],
        commentsCount = this[InstagramPosts.commentsCount],
        locationTag = this[InstagramPosts.locationTag]?.let { json.decodeFromJsonElement(InstagramLocationTagDTO.serializer(), it) },
        locationTagReadAt = this[InstagramPosts.locationTagReadAt],
        promotion = this[InstagramPosts.promotion]?.let { InstagramPromotion.valueOf(it) },
        promotionEvidence = this[InstagramPosts.promotionEvidence],
        status = InstagramPostStatus.valueOf(this[InstagramPosts.status]),
        stage = this[InstagramPosts.stage],
        error = this[InstagramPosts.error],
        processedAt = this[InstagramPosts.processedAt],
        createdAt = this[InstagramPosts.createdAt],
        updatedAt = this[InstagramPosts.updatedAt]
    )

    private fun ResultRow.toTextDTO(includeSegments: Boolean): InstagramPostTextDTO {
        val segments = this[InstagramPostTexts.segments]
        return InstagramPostTextDTO(
            id = this[InstagramPostTexts.id],
            postId = this[InstagramPostTexts.postId],
            kind = InstagramTextKind.valueOf(this[InstagramPostTexts.kind]),
            language = this[InstagramPostTexts.language],
            segmentCount = (segments as? JsonArray)?.size ?: 0,
            segments = if (includeSegments) json.decodeFromJsonElement(SEGMENTS, segments) else null,
            fullText = if (includeSegments) this[InstagramPostTexts.fullText] else null,
            params = this[InstagramPostTexts.params]?.toString(),
            createdAt = this[InstagramPostTexts.createdAt]
        )
    }

    private fun ResultRow.toRunDTO(places: List<InstagramExtractedPlaceDTO>): InstagramExtractionRunDTO = InstagramExtractionRunDTO(
        id = this[InstagramExtractionRuns.id],
        postId = this[InstagramExtractionRuns.postId],
        batchId = this[InstagramExtractionRuns.batchId],
        agent = this[InstagramExtractionRuns.agent],
        model = this[InstagramExtractionRuns.model],
        promptSha256 = this[InstagramExtractionRuns.promptSha256],
        inputTextIds = this[InstagramExtractionRuns.inputTextIds],
        status = InstagramExtractionRunStatus.valueOf(this[InstagramExtractionRuns.status]),
        promotion = this[InstagramExtractionRuns.promotion]?.let { InstagramPromotion.valueOf(it) },
        promotionEvidence = this[InstagramExtractionRuns.promotionEvidence],
        rawOutput = this[InstagramExtractionRuns.rawOutput]?.toString(),
        error = this[InstagramExtractionRuns.error],
        startedAt = this[InstagramExtractionRuns.startedAt],
        finishedAt = this[InstagramExtractionRuns.finishedAt],
        places = places,
        createdAt = this[InstagramExtractionRuns.createdAt]
    )

    private fun ResultRow.suggestedPlace(): PlaceInput? {
        val lat = this[InstagramExtractedPlaces.latitude] ?: return null
        val lng = this[InstagramExtractedPlaces.longitude] ?: return null
        return PlaceInput(
            name = this[InstagramExtractedPlaces.placeName] ?: this[InstagramExtractedPlaces.name].take(128),
            address = this[InstagramExtractedPlaces.address] ?: "",
            latitude = lat,
            longitude = lng,
            googleMapsId = this[InstagramExtractedPlaces.googleMapsId]
        )
    }

    private fun ResultRow.toPlaceDTO(existingSpotIds: List<String>): InstagramExtractedPlaceDTO = InstagramExtractedPlaceDTO(
        id = this[InstagramExtractedPlaces.id],
        runId = this[InstagramExtractedPlaces.runId],
        postId = this[InstagramExtractedPlaces.postId],
        postTitle = this[InstagramPosts.title],
        permalink = this[InstagramPosts.permalink],
        name = this[InstagramExtractedPlaces.name],
        nameFound = this[InstagramExtractedPlaces.nameFound],
        aliases = this[InstagramExtractedPlaces.aliases],
        category = this[InstagramExtractedPlaces.category],
        area = this[InstagramExtractedPlaces.area],
        description = this[InstagramExtractedPlaces.description],
        evidence = json.decodeFromJsonElement(EVIDENCE, this[InstagramExtractedPlaces.evidence]),
        confidence = this[InstagramExtractedPlaces.confidence]?.let { InstagramConfidence.valueOf(it) },
        needsVerification = this[InstagramExtractedPlaces.needsVerification],
        reason = this[InstagramExtractedPlaces.reason],
        geocodeStatus = InstagramGeocodeStatus.valueOf(this[InstagramExtractedPlaces.geocodeStatus]),
        place = suggestedPlace(),
        geocodeWarning = this[InstagramExtractedPlaces.geocodeWarning],
        reviewStatus = InstagramReviewStatus.valueOf(this[InstagramExtractedPlaces.reviewStatus]),
        reviewedAt = this[InstagramExtractedPlaces.reviewedAt],
        sunreiSpotId = this[InstagramExtractedPlaces.sunreiSpotId],
        existingSpotIds = existingSpotIds,
        createdAt = this[InstagramExtractedPlaces.createdAt]
    )

    companion object {
        private const val MAX_POSTS_PER_UPSERT = 100

        /** FAILED 게시물도 다음 수집 때 다시 처리한다. */
        private val PROCESSABLE_STATUSES = listOf(InstagramPostStatus.PENDING.name, InstagramPostStatus.FAILED.name)
        private val NO_CANDIDATE_PROMOTIONS = setOf(InstagramPromotion.DISCLOSED_AD, InstagramPromotion.SELF_PROMOTION)
        private val GEOCODED_STATUSES = setOf(InstagramGeocodeStatus.MATCHED, InstagramGeocodeStatus.NAME_MISMATCH)
        private val SEGMENTS = ListSerializer(InstagramSegmentDTO.serializer())
        private val EVIDENCE = ListSerializer(InstagramEvidenceDTO.serializer())
        private val SHORTCODE = Regex("""instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)""")
        private val HASHTAG = Regex("""#\S+""")

        private fun shortcodeOf(permalink: String): String? =
            SHORTCODE.find(permalink)?.groupValues?.get(1)?.takeIf { it.length <= 32 }

        /** 해시태그를 지우고도 4자 이상 남는 첫 줄을 128자로 자른다. */
        private fun captionTitle(caption: String?): String? =
            caption?.lineSequence()
                ?.map { HASHTAG.replace(it, "").trim().trim(' ', '-', '·', '|') }
                ?.firstOrNull { it.length >= 4 }
                ?.take(128)
    }
}
