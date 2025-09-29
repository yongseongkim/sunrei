package com.sunrei.model

import org.jetbrains.exposed.sql.kotlin.datetime.timestamp

object Places : ULIDTimestampedTable("place", "P") {
    val name = varchar("name", 128)
    val address = varchar("address", 255)
    val latitude = float("latitude")
    val longitude = float("longitude")
    val googleMapsId = varchar("google_maps_id", 255).nullable()
    val isClosed = bool("is_closed").default(false)
    val closedReason = varchar("closed_reason", 255).nullable()
    val closedAt = timestamp("closed_at").nullable()
    val notes = text("notes").nullable()
}
