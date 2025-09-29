package com.sunrei.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import kotlinx.serialization.Serializable

@Serializable
@JsonIgnoreProperties
data class Image(
    val url: String,
    val width: Int? = null,
    val height: Int? = null,
)
