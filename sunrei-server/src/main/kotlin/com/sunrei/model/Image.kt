package com.sunrei.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonIgnoreUnknownKeys

@Serializable
@JsonIgnoreUnknownKeys
data class Image(
    val url: String,
    val width: Int? = null,
    val height: Int? = null,
)