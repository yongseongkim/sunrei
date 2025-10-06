package com.sunrei.database

import com.sunrei.model.MultiSizeImage
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object SunreiSpots : ULIDTimestampedTable("sunrei_spot", "SS") {
    val title = varchar("title", 128)
    val description = text("description").nullable()
    val youtubeLink = varchar("youtube_link", 255).nullable()
    val images = json<List<MultiSizeImage>>("images", Json.Default).default(emptyList())
    val placeId = varchar("place_id", 32).references(Places.id)
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id)
    val deletedAt = timestamp("deleted_at").nullable()
}