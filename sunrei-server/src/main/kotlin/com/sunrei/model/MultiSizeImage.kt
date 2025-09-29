package com.sunrei.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import kotlinx.serialization.Serializable

@Serializable
@JsonIgnoreProperties
data class MultiSizeImage(
    val images: List<Image>
) {
    companion object {
        fun from(images: List<Image>): MultiSizeImage {
            val sortedImages = images.sortedWith(
                compareByDescending<Image> { it.width ?: 0 }
                    .thenByDescending { it.height ?: 0 }
            )
            return MultiSizeImage(images = sortedImages)
        }
    }
}