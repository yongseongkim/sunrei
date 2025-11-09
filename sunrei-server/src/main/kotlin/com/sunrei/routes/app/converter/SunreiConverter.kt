package com.sunrei.routes.app.converter

import com.sunrei.generated.dto.app.MapSunreiSpotDTO
import com.sunrei.generated.dto.app.PlaceDTO
import com.sunrei.generated.dto.app.SunreiDTO
import com.sunrei.generated.dto.app.SunreiInfoDTO
import com.sunrei.generated.dto.app.SunreiSpotDTO
import com.sunrei.generated.dto.app.TagDTO
import com.sunrei.model.Place
import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag

fun Sunrei.toDTO(): SunreiDTO {
    return SunreiDTO(
        id = id,
        title = title,
        description = description,
        link = link,
        images = images.map { it.toDTO() },
        spots = spots.map { it.toDTO() },
        tags = tags.map { it.toDTO() },
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

fun SunreiSpot.toDTO(): SunreiSpotDTO {
    return SunreiSpotDTO(
        id = id,
        sunreiId = sunreiId,
        title = title,
        description = description,
        youtubeLink = youtubeLink,
        images = images.map { it.toDTO() },
        place = place.toDTO()
    )
}

fun Place.toDTO(): PlaceDTO {
    return PlaceDTO(
        id = id,
        name = name,
        address = address,
        latitude = latitude,
        longitude = longitude,
        isClosed = isClosed,
        closedReason = closedReason,
        closedAt = closedAt,
        notes = notes,
        googleMapsId = googleMapsId
    )
}

fun Tag.toDTO(): TagDTO {
    return TagDTO(
        id = id,
        name = name,
        description = description
    )
}

/**
 * Convert Sunrei to SunreiInfoDTO (without nested spots)
 * Used for map endpoint to avoid circular data structure
 */
fun Sunrei.toSunreiInfoDTO(): SunreiInfoDTO {
    return SunreiInfoDTO(
        id = id,
        title = title,
        description = description,
        link = link,
        images = images.map { it.toDTO() },
        tags = tags.map { it.toDTO() },
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

/**
 * Convert SunreiSpot to MapSpotDTO with embedded Sunrei info
 * Used for map endpoint
 */
fun SunreiSpot.toMapSpotDTO(sunreiInfo: SunreiInfoDTO): MapSunreiSpotDTO {
    return MapSunreiSpotDTO(
        id = id,
        sunreiId = sunreiId,
        title = title,
        description = description,
        youtubeLink = youtubeLink,
        images = images.map { it.toDTO() },
        place = place.toDTO(),
        sunreiInfo = sunreiInfo
    )
}