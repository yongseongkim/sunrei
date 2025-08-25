package com.sunrei.model

import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json

object Sunreis : ULIDTimestampedTable("sunrei", "SR") {
    val title = varchar("title", 128)
    val description = text("description").nullable()
    val link = varchar("link", 255).nullable()
    val images = json<List<Image>>("images", Json.Default).default(emptyList())
}
