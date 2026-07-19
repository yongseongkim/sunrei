package com.sunrei.model

import kotlinx.datetime.Instant

data class Sunrei(
    val id: String,
    val sourceId: String,
    val source: Source?,
    val publishedAt: Instant?,
    val title: String,
    val description: String?,
    val summary: String?,
    val link: String?,
    val images: List<MultiSizeImage>,
    val spots: List<SunreiSpot>,
    val createdAt: Instant,
    val updatedAt: Instant
) {
    val isPublished: Boolean get() = publishedAt != null
}
