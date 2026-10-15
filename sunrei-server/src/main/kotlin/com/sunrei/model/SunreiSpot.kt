package com.sunrei.model

data class SunreiSpot(
    val id: String,
    val sunreiId: String,
    val title: String,
    val context: String?,
    val sourceLink: String?,
    val images: List<MultiSizeImage>,
    val place: Place,
    val tags: List<Tag> = emptyList(),
    val distanceMeters: Double? = null
)
