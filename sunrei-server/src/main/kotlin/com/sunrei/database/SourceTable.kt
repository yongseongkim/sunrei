package com.sunrei.database

import com.sunrei.model.MultiSizeImage
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.json.json
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object Sources : ULIDTimestampedTable("source", "SRC") {
    val type = varchar("type", 16)
        .check { it inList(listOf("YOUTUBE", "TV", "ANIME", "OTHER")) }
    val name = varchar("name", 255)
    val nameEn = varchar("name_en", 255).nullable()
    val nameKo = varchar("name_ko", 255).nullable()
    val synopsis = text("synopsis").nullable()
    val externalUrl = varchar("external_url", 512).nullable()
    val posterImage = json<MultiSizeImage>("poster_image", Json.Default).nullable()
    val deletedAt = timestamp("deleted_at").nullable()
}
