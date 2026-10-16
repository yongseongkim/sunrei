package com.sunrei.database

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object InstagramAccounts : Table("instagram_account") {
    val id = varchar("id", 32)
    val username = varchar("username", 64)
    val name = varchar("name", 255).nullable()
    val biography = text("biography").nullable()
    val followersCount = integer("followers_count").nullable()
    val mediaCount = integer("media_count").nullable()
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id).nullable()
    val syncEnabled = bool("sync_enabled").default(true)
    val backfillCursor = text("backfill_cursor").nullable()
    val backfillCompletedAt = timestamp("backfill_completed_at").nullable()
    val lastSyncedAt = timestamp("last_synced_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")

    override val primaryKey = PrimaryKey(id)
}

object InstagramPosts : Table("instagram_post") {
    val id = varchar("id", 32)
    val accountId = varchar("account_id", 32).references(InstagramAccounts.id)
    val shortcode = varchar("shortcode", 32)
    val permalink = varchar("permalink", 255)
    val mediaType = varchar("media_type", 16)
    val productType = varchar("product_type", 16).nullable()
    val caption = text("caption").nullable()
    val title = varchar("title", 128)
    val postedAt = timestamp("posted_at")
    val likeCount = integer("like_count").nullable()
    val commentsCount = integer("comments_count").nullable()
    val locationTag = jsonb<JsonElement>("location_tag", Json.Default).nullable()
    val locationTagReadAt = timestamp("location_tag_read_at").nullable()
    val promotion = varchar("promotion", 16).nullable()
    val promotionEvidence = text("promotion_evidence").nullable()
    val status = varchar("status", 16)
    val stage = varchar("stage", 64).nullable()
    val error = text("error").nullable()
    val processedAt = timestamp("processed_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")

    override val primaryKey = PrimaryKey(id)
}

object InstagramPostTexts : ULIDTable("instagram_post_text", "IT") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val kind = varchar("kind", 16)
    val language = varchar("language", 16).nullable()
    val segments = jsonb<JsonElement>("segments", Json.Default)
    val fullText = text("full_text").nullable()
    val params = jsonb<JsonElement>("params", Json.Default).nullable()
    val createdAt = timestamp("created_at")
}

object InstagramExtractionRuns : ULIDTable("instagram_extraction_run", "IR") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val batchId = varchar("batch_id", 32).nullable()
    val agent = varchar("agent", 32)
    val model = varchar("model", 64).nullable()
    val promptSha256 = varchar("prompt_sha256", 64).nullable()
    val inputTextIds = jsonb<List<String>>("input_text_ids", Json.Default)
    val status = varchar("status", 16)
    val promotion = varchar("promotion", 16).nullable()
    val promotionEvidence = text("promotion_evidence").nullable()
    val rawOutput = jsonb<JsonElement>("raw_output", Json.Default).nullable()
    val error = text("error").nullable()
    val startedAt = timestamp("started_at").nullable()
    val finishedAt = timestamp("finished_at").nullable()
    val createdAt = timestamp("created_at")
}

object InstagramExtractedPlaces : ULIDTable("instagram_extracted_place", "IP") {
    val runId = varchar("run_id", 32).references(InstagramExtractionRuns.id)
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val name = varchar("name", 255)
    val nameFound = bool("name_found").default(true)
    val aliases = jsonb<List<String>>("aliases", Json.Default)
    val category = varchar("category", 64).nullable()
    val area = varchar("area", 255).nullable()
    val description = text("description").nullable()
    val evidence = jsonb<JsonElement>("evidence", Json.Default)
    val confidence = varchar("confidence", 8).nullable()
    val needsVerification = bool("needs_verification").default(false)
    val reason = text("reason").nullable()
    val geocodeStatus = varchar("geocode_status", 16)
    val placeName = varchar("place_name", 128).nullable()
    val address = varchar("address", 255).nullable()
    val latitude = float("latitude").nullable()
    val longitude = float("longitude").nullable()
    val googleMapsId = varchar("google_maps_id", 255).nullable()
    val geocodeWarning = text("geocode_warning").nullable()
    val reviewStatus = varchar("review_status", 16)
    val reviewedAt = timestamp("reviewed_at").nullable()
    val sunreiSpotId = varchar("sunrei_spot_id", 32).references(SunreiSpots.id).nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object InstagramPostAttempts : ULIDTable("instagram_post_attempt", "IA") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val stage = varchar("stage", 64)
    val error = text("error")
    val createdAt = timestamp("created_at")
}
