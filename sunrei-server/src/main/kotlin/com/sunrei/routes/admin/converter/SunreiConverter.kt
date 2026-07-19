package com.sunrei.routes.admin.converter

import com.sunrei.generated.dto.admin.ImageDTO
import com.sunrei.generated.dto.admin.MultiSizeImageDTO
import com.sunrei.generated.dto.admin.PlaceDTO
import com.sunrei.generated.dto.admin.SourceDTO
import com.sunrei.generated.dto.admin.SourceRowDTO
import com.sunrei.generated.dto.admin.SunreiDTO
import com.sunrei.generated.dto.admin.SunreiSpotDTO
import com.sunrei.generated.dto.admin.TagDTO
import com.sunrei.model.MultiSizeImage
import com.sunrei.model.Place
import com.sunrei.model.Source
import com.sunrei.model.SourceType as ModelSourceType
import com.sunrei.model.Sunrei
import com.sunrei.model.SunreiSpot
import com.sunrei.model.Tag

// ===== Source type mapping (model enum -> generated enum share the same constant names) =====
fun ModelSourceType.toDtoType(): com.sunrei.generated.dto.admin.SourceType =
    com.sunrei.generated.dto.admin.SourceType.valueOf(name)

fun Source.toDTO(): SourceDTO = SourceDTO(
    id = id,
    type = type.toDtoType(),
    name = name,
    nameEn = nameEn,
    nameKo = nameKo,
    synopsis = synopsis,
    externalUrl = externalUrl,
    posterImage = posterImage?.toDTO(),
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun Source.toRowDTO(sunreiCount: Int, spotCount: Int): SourceRowDTO = SourceRowDTO(
    id = id,
    type = type.toDtoType(),
    name = name,
    nameEn = nameEn,
    nameKo = nameKo,
    synopsis = synopsis,
    externalUrl = externalUrl,
    posterImage = posterImage?.toDTO(),
    createdAt = createdAt,
    updatedAt = updatedAt,
    sunreiCount = sunreiCount,
    spotCount = spotCount
)

// ===== Tag (bilingual) =====
fun Tag.toDTO(): TagDTO = TagDTO(
    id = id,
    labelEn = labelEn,
    labelKo = labelKo,
    description = description
)

// ===== SunreiSpot (context + spot-level tags) =====
fun SunreiSpot.toDTO(): SunreiSpotDTO = SunreiSpotDTO(
    id = id,
    sunreiId = sunreiId,
    title = title,
    description = description,
    context = context,
    youtubeLink = youtubeLink,
    images = images.map { it.toDTO() },
    place = place.toDTO(),
    tags = tags.map { it.toDTO() }
)

// ===== Sunrei (source + sourceId + summary + publishedAt; no sunrei-level tags) =====
fun Sunrei.toDTO(): SunreiDTO {
    val source = source ?: error("Sunrei $id has no source loaded; admin DTO requires a source")
    return SunreiDTO(
        id = id,
        sourceId = sourceId,
        source = source.toDTO(),
        publishedAt = publishedAt,
        title = title,
        description = description,
        summary = summary,
        link = link,
        images = images.map { it.toDTO() },
        spots = spots.map { it.toDTO() },
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

// ===== Place =====
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
