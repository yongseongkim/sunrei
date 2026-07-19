package com.sunrei.service

import com.sunrei.model.MultiSizeImage
import com.sunrei.model.Place
import com.sunrei.model.Source
import com.sunrei.model.Tag

/**
 * One mention = one video row in a PlaceCard. Multiple spots of the same video at the
 * same place collapse into one representative mention.
 */
data class PlaceMention(
    val source: Source,
    val sunreiId: String,
    val sunreiTitle: String,
    val spotId: String,
    val context: String?,
    val sunreiLink: String?,
    val youtubeLink: String?,
    val images: List<MultiSizeImage>,
    val tags: List<Tag>
)

/** One Place = one card = one marker. */
data class PlaceFeedItem(
    val place: Place,
    val distanceMeters: Double?,
    val mentions: List<PlaceMention>,
    val tags: List<Tag>,
    val sourceCount: Int,
    val sunreiCount: Int,
    val spotCount: Int
)
