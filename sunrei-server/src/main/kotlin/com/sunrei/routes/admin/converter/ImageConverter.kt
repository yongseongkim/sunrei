package com.sunrei.routes.admin.converter

import com.sunrei.model.Image
import com.sunrei.model.MultiSizeImage
import com.sunrei.generated.dto.admin.MultiSizeImageDTO
import com.sunrei.generated.dto.admin.ImageDTO

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

fun MultiSizeImageDTO.toModel(): MultiSizeImage {
    return MultiSizeImage(
        images = images.map { img ->
            Image(
                url = img.url,
                width = img.width,
                height = img.height
            )
        }
    )
}