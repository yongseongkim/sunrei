package com.sunrei.routes.admin

import com.sunrei.di.injectS3Service
import com.sunrei.generated.dto.admin.ImageDTO
import com.sunrei.generated.dto.admin.MultiSizeImageDTO
import com.sunrei.generated.dto.admin.UploadImageFromUrlRequest
import com.sunrei.model.Image
import com.sunrei.model.MultiSizeImage
import com.sunrei.service.S3Service
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray

fun Route.imageRoutes() {
    route("/images") {
        // Upload image file
        post("/upload") {
            val s3Service: S3Service = call.injectS3Service()
            val multipart = call.receiveMultipart()
            var uploadedFile: PartData.FileItem? = null

            multipart.forEachPart { part ->
                when (part) {
                    is PartData.FileItem -> {
                        if (part.name == "file") {
                            uploadedFile = part
                        }
                    }

                    else -> Unit
                }
                if (uploadedFile == null) {
                    part.dispose()
                }
            }

            val file = uploadedFile ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "No file uploaded"))
                return@post
            }

            try {
                // Check file size (max 5MB)
                val bytes = file.provider().readRemaining().readByteArray()
                if (bytes.size > 5 * 1024 * 1024) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "File too large (max 5MB)"))
                    return@post
                }

                val contentType = file.contentType ?: ContentType.Application.OctetStream
                if (!contentType.match(ContentType.Image.Any)) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Only image files are allowed"))
                    return@post
                }

                val originalFileName = file.originalFileName ?: "image.jpg"
                val results = s3Service.uploadImage(bytes, originalFileName)

                val images = results.map { result ->
                    Image(url = result.url, width = result.width, height = result.height)
                }

                val multiSizeImage = MultiSizeImage.from(images)
                val imageDTOs = multiSizeImage.images.map { img ->
                    ImageDTO(
                        url = img.url,
                        width = img.width,
                        height = img.height
                    )
                }

                call.respond(HttpStatusCode.Created, MultiSizeImageDTO(images = imageDTOs))
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    mapOf("error" to "Failed to upload image: ${e.message}")
                )
            } finally {
                file.dispose()
            }
        }

        // Upload image from URL
        post("/upload-url") {
            val s3Service: S3Service = call.injectS3Service()
            val request = call.receive<UploadImageFromUrlRequest>()

            if (request.url.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "URL is required"))
                return@post
            }

            // Validate URL format
            try {
                io.ktor.http.Url(request.url)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid URL format"))
                return@post
            }

            try {
                val results = s3Service.uploadImageFromUrl(request.url)

                val images = results.map { result ->
                    Image(url = result.url, width = result.width, height = result.height)
                }

                val multiSizeImage = MultiSizeImage.from(images)

                val imageDTOs = multiSizeImage.images.map { img ->
                    ImageDTO(
                        url = img.url,
                        width = img.width,
                        height = img.height
                    )
                }
                call.respond(HttpStatusCode.Created, MultiSizeImageDTO(images = imageDTOs))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to e.message))
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    mapOf("error" to "Failed to upload image from URL: ${e.message}")
                )
            }
        }
    }
}
