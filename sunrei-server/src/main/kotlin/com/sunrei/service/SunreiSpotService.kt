package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.model.Place
import com.sunrei.model.SunreiSpot
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

class SunreiSpotService {

    fun getById(id: String): SunreiSpot? = transaction {
        (SunreiSpots innerJoin Places)
            .select { SunreiSpots.id eq id }
            .firstOrNull()?.let { row ->
                SunreiSpot(
                    id = row[SunreiSpots.id],
                    sunreiId = row[SunreiSpots.sunreiId],
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images],
                    place = Place(
                        id = row[Places.id],
                        name = row[Places.name],
                        address = row[Places.address],
                        latitude = row[Places.latitude],
                        longitude = row[Places.longitude],
                        isClosed = row[Places.isClosed],
                        closedReason = row[Places.closedReason],
                        closedAt = row[Places.closedAt],
                        notes = row[Places.notes]
                    )
                )
            }
    }

    fun listByPlaceIds(placeIds: List<String>): Map<String, List<SunreiSpot>> {
        if (placeIds.isEmpty()) return emptyMap()

        return transaction {
            (SunreiSpots innerJoin Places)
                .select { (SunreiSpots.placeId inList placeIds) and (SunreiSpots.deletedAt.isNull()) }
                .map { row ->
                    val placeId = row[SunreiSpots.placeId]
                    val spot = SunreiSpot(
                        id = row[SunreiSpots.id],
                        sunreiId = row[SunreiSpots.sunreiId],
                        title = row[SunreiSpots.title],
                        description = row[SunreiSpots.description],
                        youtubeLink = row[SunreiSpots.youtubeLink],
                        images = row[SunreiSpots.images],
                        place = Place(
                            id = row[Places.id],
                            name = row[Places.name],
                            address = row[Places.address],
                            latitude = row[Places.latitude],
                            longitude = row[Places.longitude],
                            isClosed = row[Places.isClosed],
                            closedReason = row[Places.closedReason],
                            closedAt = row[Places.closedAt],
                            notes = row[Places.notes]
                        )
                    )
                    placeId to spot
                }
                .groupBy({ it.first }, { it.second })
        }
    }
}