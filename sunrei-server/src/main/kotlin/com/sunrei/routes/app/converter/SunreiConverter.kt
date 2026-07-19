package com.sunrei.routes.app.converter

import com.sunrei.generated.dto.app.PlaceDTO
import com.sunrei.generated.dto.app.SourceDTO
import com.sunrei.generated.dto.app.SunreiDTO
import com.sunrei.generated.dto.app.SunreiSpotDTO
import com.sunrei.generated.dto.app.TagDTO
import com.sunrei.model.Place
import com.sunrei.model.Source
import com.sunrei.model.SourceType as ModelSourceType
import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag

// ===== Source type mapping (model enum -> generated enum share the same constant names) =====
fun ModelSourceType.toDtoType(): com.sunrei.generated.dto.app.SourceType =
    com.sunrei.generated.dto.app.SourceType.valueOf(name)

fun Source.toDTO(): SourceDTO = SourceDTO(
    id = id,
    type = type.toDtoType(),
    name = name,
    nameEn = nameEn,
    nameKo = nameKo,
    synopsis = synopsis,
    externalUrl = externalUrl,
    posterImage = posterImage?.toDTO()
)

fun Tag.toDTO(): TagDTO = TagDTO(
    id = id,
    labelEn = labelEn,
    labelKo = labelKo,
    description = description
)

fun Place.toDTO(): PlaceDTO = PlaceDTO(
    id = id,
    name = name,
    address = address,
    latitude = latitude,
    longitude = longitude,
    googleMapsId = googleMapsId,
    isClosed = isClosed,
    closedReason = closedReason,
    closedAt = closedAt,
    notes = notes
)

fun SunreiSpot.toDTO(): SunreiSpotDTO = SunreiSpotDTO(
    id = id,
    sunreiId = sunreiId,
    title = title,
    description = description,
    context = context,
    youtubeLink = youtubeLink,
    images = images.map { it.toDTO() },
    place = place.toDTO(),
    tags = tags.map { it.toDTO() },
    distanceMeters = distanceMeters
)

fun Sunrei.toDTO(): SunreiDTO {
    val src = source ?: error("Sunrei $id has no source loaded; app DTO requires a source")
    return SunreiDTO(
        id = id,
        sourceId = sourceId,
        source = src.toDTO(),
        title = title,
        description = description,
        summary = summary,
        link = link,
        images = images.map { it.toDTO() },
        spots = spots.map { it.toDTO() }
    )
}
