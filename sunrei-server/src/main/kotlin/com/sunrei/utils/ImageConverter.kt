package com.sunrei.utils

import com.sunrei.model.MultiSizeImage
import com.sunrei.generated.dto.admin.ImageDTO as AdminImageDTO
import com.sunrei.generated.dto.admin.MultiSizeImageDTO as AdminMultiSizeImageDTO
import com.sunrei.generated.dto.app.ImageDTO as AppImageDTO
import com.sunrei.generated.dto.app.MultiSizeImageDTO as AppMultiSizeImageDTO

fun List<MultiSizeImage>.toAdminMultiSizeImages(): List<AdminMultiSizeImageDTO> {
    return this.map { multiSizeImage ->
        AdminMultiSizeImageDTO(
            images = multiSizeImage.images.map { img ->
                AdminImageDTO(
                    url = img.url,
                    width = img.width,
                    height = img.height
                )
            }
        )
    }
}

fun List<MultiSizeImage>.toAppMultiSizeImages(): List<AppMultiSizeImageDTO> {
    return this.map { multiSizeImage ->
        AppMultiSizeImageDTO(
            images = multiSizeImage.images.map { img ->
                AppImageDTO(
                    url = img.url,
                    width = img.width,
                    height = img.height
                )
            }
        )
    }
}