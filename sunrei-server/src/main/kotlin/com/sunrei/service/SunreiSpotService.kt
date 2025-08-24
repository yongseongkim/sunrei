package com.sunrei.service

import com.sunrei.generated.dto.*
import com.sunrei.model.*
import org.jetbrains.exposed.sql.*
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
                            id = img.id,
                            url = img.url,
                            width = img.width,
                            height = img.height,
                            displayOrder = img.displayOrder
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