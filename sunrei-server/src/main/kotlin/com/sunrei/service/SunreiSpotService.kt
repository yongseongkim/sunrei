package com.sunrei.service

import com.sunrei.generated.dto.ImageDTO
import com.sunrei.generated.dto.PlaceDTO
import com.sunrei.generated.dto.SunreiSpotDTO
import com.sunrei.model.Places
import com.sunrei.model.SunreiSpots
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

class SunreiSpotService {

    fun findOne(id: String): SunreiSpotDTO? = transaction {
        (SunreiSpots innerJoin Places)
            .select { SunreiSpots.id eq id }
            .firstOrNull()?.let { row ->
                SunreiSpotDTO(
                    id = row[SunreiSpots.id],
                    title = row[SunreiSpots.title],
                    description = row[SunreiSpots.description],
                    youtubeLink = row[SunreiSpots.youtubeLink],
                    images = row[SunreiSpots.images].map { img ->
                        ImageDTO(
                            url = img.url,
                            width = img.width,
                            height = img.height,
                        )
                    },
                    places = listOf(
                        PlaceDTO(
                            id = row[Places.id],
                            name = row[Places.name],
                            address = row[Places.address],
                            latitude = row[Places.latitude],
                            longitude = row[Places.longitude]
                        )
                    )
                )
            }
    }
}