package com.sunrei.model

data class SunreiSpot(
    val id: String,
    val sunreiId: String,
    val title: String,
    val description: String?,
    val context: String?,
    val youtubeLink: String?,
    val images: List<MultiSizeImage>,
    val place: Place,
    val tags: List<Tag> = emptyList(),
    val distanceMeters: Double? = null
)
