package com.sunrei.model

import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json

object Sunreis : ULIDTimestampedTable("sunrei", "SR") {
    val title = varchar("title", 128)
    val description = text("description").nullable()
    val link = varchar("link", 255).nullable()
    val images = json<List<Image>>("images", Json.Default).default(emptyList())
}

data class SunreiEntity(
    val id: String,
    val title: String,
    val description: String? = null,
    val link: String? = null,
    val images: List<Image> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant
)