package com.sunrei.service

import com.sunrei.generated.dto.app.PlaceDTO
import com.sunrei.generated.dto.app.SunreiSpotDTO
import com.sunrei.model.Places
import com.sunrei.model.SunreiSpots
import com.sunrei.utils.toAppMultiSizeImages
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

class SunreiSpotService {

    fun findOne(id: String): SunreiSpotDTO? = transaction {
        (SunreiSpots innerJoin Places)
            .select { SunreiSpots.id eq id }
            .firstOrNull()?.let { row ->
                SunreiSpotDTO(
                    id = row[SunreiSpots.id],
                    sunreiId = row[SunreiSpots.sunreiId],
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images].toAppMultiSizeImages(),
                    place = PlaceDTO(
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
}