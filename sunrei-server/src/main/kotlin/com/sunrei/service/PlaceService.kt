package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.model.Place
import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.transactions.transaction
import java.sql.ResultSet

class PlaceService {

    fun listByPolygon(polygonWKT: String): List<Place> = transaction {
        val sql = """
            SELECT
                id, name, address, latitude, longitude,
                is_closed, closed_reason, closed_at, notes
            FROM place
            WHERE ST_Within(geom, ST_GeomFromText(?, 4326))
        """.trimIndent()

        val places = mutableListOf<Place>()

        exec(sql, listOf(polygonWKT)) { rs ->
            while (rs.next()) {
                places.add(
                    Place(
                        id = rs.getString("id"),
                        name = rs.getString("name"),
                        address = rs.getString("address"),
                        latitude = rs.getFloat("latitude"),
                        longitude = rs.getFloat("longitude"),
                        isClosed = rs.getBoolean("is_closed"),
                        closedReason = rs.getString("closed_reason"),
                        closedAt = rs.getTimestamp("closed_at")?.toInstant()?.let {
                            kotlinx.datetime.Instant.fromEpochMilliseconds(it.toEpochMilli())
                        },
                        notes = rs.getString("notes")
                    )
                )
            }
        }

        places
    }
}