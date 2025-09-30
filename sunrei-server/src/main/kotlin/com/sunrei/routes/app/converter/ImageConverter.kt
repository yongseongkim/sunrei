package com.sunrei.routes.app.converter

import com.sunrei.model.MultiSizeImage
import com.sunrei.generated.dto.app.MultiSizeImageDTO
import com.sunrei.generated.dto.app.ImageDTO

fun MultiSizeImage.toDTO(): MultiSizeImageDTO {
    return MultiSizeImageDTO(
        images = images.map { img ->
            ImageDTO(
                url = img.url,
                width = img.width,
                height = img.height
            )
        }
    )
}