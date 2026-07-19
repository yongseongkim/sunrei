package com.sunrei.routes.app.converter

import com.sunrei.generated.dto.app.PlaceCardDTO
import com.sunrei.generated.dto.app.PlaceMentionDTO
import com.sunrei.service.PlaceFeedItem
import com.sunrei.service.PlaceMention

fun PlaceMention.toDTO(): PlaceMentionDTO = PlaceMentionDTO(
    source = source.toDTO(),
    sunreiId = sunreiId,
    sunreiTitle = sunreiTitle,
    spotId = spotId,
    context = context,
    sunreiLink = sunreiLink,
    youtubeLink = youtubeLink,
    images = images.map { it.toDTO() },
    tags = tags.map { it.toDTO() }
)

fun PlaceFeedItem.toDTO(): PlaceCardDTO = PlaceCardDTO(
    place = place.toDTO(),
    distanceMeters = distanceMeters,
    mentions = mentions.map { it.toDTO() },
    tags = tags.map { it.toDTO() },
    sourceCount = sourceCount,
    sunreiCount = sunreiCount,
    spotCount = spotCount
)
