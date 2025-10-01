package com.sunrei.routes.admin.converter

import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Place
import com.sunrei.model.Tag

import com.sunrei.generated.dto.admin.SunreiDTO
import com.sunrei.generated.dto.admin.SunreiSpotDTO
import com.sunrei.generated.dto.admin.PlaceDTO
import com.sunrei.generated.dto.admin.TagDTO

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
        notes = notes
    )
}

fun Tag.toDTO(): TagDTO {
    return TagDTO(
        id = id,
        name = name,
        description = description
    )
}