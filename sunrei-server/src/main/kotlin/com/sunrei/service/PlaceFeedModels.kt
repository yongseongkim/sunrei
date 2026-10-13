package com.sunrei.service

import com.sunrei.model.MultiSizeImage
import com.sunrei.model.Place
import com.sunrei.model.Source
import com.sunrei.model.Tag

/** PlaceCard에서 Sunrei 하나를 나타내는 한 줄이다. */
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

data class PlaceFeedItem(
    val place: Place,
    val distanceMeters: Double?,
    val mentions: List<PlaceMention>,
    val tags: List<Tag>,
    val sourceCount: Int,
    val sunreiCount: Int,
    val spotCount: Int
)
