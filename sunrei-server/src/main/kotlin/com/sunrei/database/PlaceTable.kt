package com.sunrei.database

import org.jetbrains.exposed.sql.Column
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
    val deletedAt = timestamp("deleted_at").nullable()

    val geom: Column<String> = registerColumn("geom", GeometryColumnType())
}

// Custom column type for PostGIS geometry
private class GeometryColumnType : org.jetbrains.exposed.sql.ColumnType() {
    override fun sqlType(): String = "geometry(Point, 4326)"
    override fun valueFromDB(value: Any): String = value.toString()
    override fun notNullValueToDB(value: Any): Any = value
}