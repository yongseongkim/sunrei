package com.sunrei.model

import kotlinx.datetime.Instant

// converter가 상수 이름으로 바꾸므로 OpenAPI 명세의 SourceType과 이름이 같아야 한다.
enum class SourceType {
    YOUTUBE,
    INSTAGRAM,
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
