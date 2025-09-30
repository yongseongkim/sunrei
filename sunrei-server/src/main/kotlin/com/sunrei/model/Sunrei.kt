package com.sunrei.model

import kotlinx.datetime.Instant

data class Sunrei(
    val id: String,
    val title: String,
    val description: String?,
    val link: String?,
    val images: List<MultiSizeImage>,
    val spots: List<SunreiSpot>,
    val tags: List<Tag>,
    val createdAt: Instant,
    val updatedAt: Instant
)