package com.sunrei.model

import kotlinx.serialization.Serializable

@Serializable
data class Image(
    val id: String,
    val url: String,
    val width: Int? = null,
    val height: Int? = null,
    val displayOrder: Int = 0
)