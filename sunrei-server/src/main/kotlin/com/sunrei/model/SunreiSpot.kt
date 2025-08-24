package com.sunrei.model

import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json

object SunreiSpots : ULIDTimestampedTable("sunrei_spot", "SS") {
    val title = varchar("title", 64)
    val description = text("description").nullable()
    val youtubeLink = varchar("youtube_link", 255).nullable()
    val images = json<List<Image>>("images", Json.Default).default(emptyList())
    val placeId = varchar("place_id", 32).references(Places.id)
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id)
}

data class SunreiSpotEntity(
    val id: String,
    val title: String,
    val description: String? = null,
    val youtubeLink: String? = null,
    val images: List<Image> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
    val placeId: String,
    val sunreiId: String
)