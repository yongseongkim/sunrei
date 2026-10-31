package com.sunrei.database

import com.sunrei.model.MultiSizeImage
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object SunreiSpots : ULIDTimestampedTable("sunrei_spot", "SS") {
    val title = varchar("title", 128)
    val context = text("context").nullable()
    val sourceLink = varchar("source_link", 255).nullable()
    val images = json<List<MultiSizeImage>>("images", Json.Default).default(emptyList())
    val placeId = varchar("place_id", 32).references(Places.id)
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id)
    val sortOrder = integer("sort_order").default(0)
    val deletedAt = timestamp("deleted_at").nullable()
}
