package com.sunrei.database

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object YoutubePlaylists : Table("youtube_playlist") {
    val id = varchar("id", 64)
    val title = varchar("title", 255)
    val description = text("description").nullable()
    val channelId = varchar("channel_id", 64).nullable()
    val channelTitle = varchar("channel_title", 255).nullable()
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id).nullable()
    val syncEnabled = bool("sync_enabled").default(true)
    val lastSyncedAt = timestamp("last_synced_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")

    override val primaryKey = PrimaryKey(id)
}

object YoutubeVideos : Table("youtube_video") {
    val id = varchar("id", 32)
    val title = varchar("title", 255)
    val description = text("description").nullable()
    val channelId = varchar("channel_id", 64).nullable()
    val channelTitle = varchar("channel_title", 255).nullable()
    val publishedAt = timestamp("published_at").nullable()
    val durationSeconds = integer("duration_seconds").nullable()
    val thumbnailUrl = varchar("thumbnail_url", 512).nullable()
    val status = varchar("status", 16)
    val stage = varchar("stage", 64).nullable()
    val error = text("error").nullable()
    val processedAt = timestamp("processed_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")

    override val primaryKey = PrimaryKey(id)
}

object YoutubePlaylistVideos : Table("youtube_playlist_video") {
    val playlistId = varchar("playlist_id", 64).references(YoutubePlaylists.id)
    val videoId = varchar("video_id", 32).references(YoutubeVideos.id)
    val position = integer("position").nullable()
    val firstSeenAt = timestamp("first_seen_at")
    val removedAt = timestamp("removed_at").nullable()

    override val primaryKey = PrimaryKey(playlistId, videoId)
}

object YoutubeVideoTexts : ULIDTable("youtube_video_text", "YT") {
    val videoId = varchar("video_id", 32).references(YoutubeVideos.id)
    val kind = varchar("kind", 32)
    val language = varchar("language", 16).nullable()
    val segments = jsonb<JsonElement>("segments", Json.Default)
    val fullText = text("full_text").nullable()
    val payload = jsonb<JsonElement>("payload", Json.Default).nullable()
    val params = jsonb<JsonElement>("params", Json.Default).nullable()
    val createdAt = timestamp("created_at")
}

object YoutubeExtractionRuns : ULIDTable("youtube_extraction_run", "YR") {
    val videoId = varchar("video_id", 32).references(YoutubeVideos.id)
    val agent = varchar("agent", 32)
    val model = varchar("model", 64).nullable()
    val promptSha256 = varchar("prompt_sha256", 64).nullable()
    val inputTextIds = jsonb<List<String>>("input_text_ids", Json.Default)
    val status = varchar("status", 16)
    val rawOutput = jsonb<JsonElement>("raw_output", Json.Default).nullable()
    val error = text("error").nullable()
    val startedAt = timestamp("started_at").nullable()
    val finishedAt = timestamp("finished_at").nullable()
    val createdAt = timestamp("created_at")
}

object YoutubeExtractedPlaces : ULIDTable("youtube_extracted_place", "YP") {
    val runId = varchar("run_id", 32).references(YoutubeExtractionRuns.id)
    val videoId = varchar("video_id", 32).references(YoutubeVideos.id)
    val name = varchar("name", 255)
    val aliases = jsonb<List<String>>("aliases", Json.Default)
    val category = varchar("category", 64).nullable()
    val area = varchar("area", 255).nullable()
    val description = text("description").nullable()
    val evidence = jsonb<JsonElement>("evidence", Json.Default)
    val confidence = varchar("confidence", 8).nullable()
    val needsVerification = bool("needs_verification").default(false)
    val reason = text("reason").nullable()
    val timestampSeconds = integer("timestamp_seconds").nullable()
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

object YoutubeVideoAttempts : ULIDTable("youtube_video_attempt", "YA") {
    val videoId = varchar("video_id", 32).references(YoutubeVideos.id)
    val stage = varchar("stage", 64)
    val error = text("error")
    val createdAt = timestamp("created_at")
}
