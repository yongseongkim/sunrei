package com.sunrei.model

import kotlinx.datetime.Instant

enum class SourceType {
    YOUTUBE,
    TV,
    ANIME,
    OTHER
}

data class Source(
    val id: String,
    val type: SourceType,
    val name: String,
    val nameEn: String?,
    val nameKo: String?,
    val synopsis: String?,
    val externalUrl: String?,
    val posterImage: MultiSizeImage?,
    val deletedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant
)
