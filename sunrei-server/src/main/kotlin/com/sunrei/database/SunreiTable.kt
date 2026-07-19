package com.sunrei.database

import com.sunrei.model.MultiSizeImage
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object Sunreis : ULIDTimestampedTable("sunrei", "SR") {
    val sourceId = varchar("source_id", 32).references(Sources.id)
    val publishedAt = timestamp("published_at").nullable()
    val title = varchar("title", 128)
    val description = text("description").nullable()
    val summary = text("summary").nullable()
    val link = varchar("link", 255).nullable()
    val images = json<List<MultiSizeImage>>("images", Json.Default).default(emptyList())
    val deletedAt = timestamp("deleted_at").nullable()
}
