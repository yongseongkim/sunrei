package com.sunrei.service

import aws.sdk.kotlin.services.s3.S3Client
import aws.sdk.kotlin.services.s3.model.DeleteObjectRequest
import aws.sdk.kotlin.services.s3.model.GetObjectRequest
import aws.sdk.kotlin.services.s3.model.NoSuchKey
import aws.sdk.kotlin.services.s3.model.PutObjectRequest
import aws.smithy.kotlin.runtime.content.ByteStream
import aws.smithy.kotlin.runtime.content.decodeToString
import com.github.f4b6a3.ulid.UlidCreator
import io.ktor.client.HttpClient
import io.ktor.client.plugins.timeout
import io.ktor.client.request.get
import io.ktor.client.statement.readBytes
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import net.coobird.thumbnailator.Thumbnails
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

class S3Service(
    private val httpClient: HttpClient,
    private val config: S3Config
) {
    private val s3Client = S3Client {
        region = config.region
        credentialsProvider = aws.sdk.kotlin.runtime.auth.credentials.StaticCredentialsProvider {
            accessKeyId = config.accessKeyId
            secretAccessKey = config.secretAccessKey
        }
    }

    private fun generateObjectKey(originalName: String, suffix: String = ""): String {
        val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
        val year = now.year
        val month = now.monthNumber.toString().padStart(2, '0')
        val ulid = UlidCreator.getUlid().toString().lowercase()

        val extension = if (originalName.contains('.')) {
            originalName.substringAfterLast('.').lowercase()
        } else {
            "jpg"
        }

        val suffixPart = if (suffix.isNotEmpty()) "_$suffix" else ""

        return "$year/$month/$ulid$suffixPart.$extension"
    }

    private data class ImageVariant(
        val maxDimension: Int,
        val quality: Double
    )

    private val imageVariants = listOf(
        ImageVariant(200, 0.85),
        ImageVariant(800, 0.9),
        ImageVariant(1920, 0.9)
    )

    private suspend fun processImages(bytes: ByteArray): List<ProcessedImage> = withContext(Dispatchers.IO) {
        val inputStream = ByteArrayInputStream(bytes)
        val originalImage = ImageIO.read(inputStream)
            ?: throw IllegalArgumentException("Invalid image format")

        val originalWidth = originalImage.width
        val originalHeight = originalImage.height

        val hasAlpha = originalImage.colorModel.hasAlpha()
        val outputFormat = if (hasAlpha) "png" else "jpg"
        val contentType = if (hasAlpha) "image/png" else "image/jpeg"

        val processedImages = mutableListOf<ProcessedImage>()

        val variantsToCreate = when {
            originalWidth > 1920 || originalHeight > 1920 -> imageVariants
            originalWidth > 800 || originalHeight > 800 -> imageVariants.take(2)
            else -> imageVariants.take(1)
        }

        for (variant in variantsToCreate) {
            if (originalWidth <= variant.maxDimension && originalHeight <= variant.maxDimension) {
                continue
            }

            val variantOutputStream = ByteArrayOutputStream()
            val builder = Thumbnails.of(originalImage)
                .size(variant.maxDimension, variant.maxDimension)
                .keepAspectRatio(true)

            if (outputFormat == "jpg") {
                builder.outputQuality(variant.quality).outputFormat("jpg")
            } else {
                builder.outputFormat("png")
            }

            builder.toOutputStream(variantOutputStream)

            val variantBytes = variantOutputStream.toByteArray()
            val variantImage = ImageIO.read(ByteArrayInputStream(variantBytes))

            processedImages.add(
                ProcessedImage(
                    bytes = variantBytes,
                    width = variantImage?.width ?: 0,
                    height = variantImage?.height ?: 0,
                    contentType = contentType,
                    isOriginal = false
                )
            )
        }

        val originalOutputStream = ByteArrayOutputStream()
        val maxOriginalDimension = 2048

        if (originalWidth > maxOriginalDimension || originalHeight > maxOriginalDimension) {
            val builder = Thumbnails.of(originalImage)
                .size(maxOriginalDimension, maxOriginalDimension)
                .keepAspectRatio(true)

            if (outputFormat == "jpg") {
                builder.outputQuality(0.9).outputFormat("jpg")
            } else {
                builder.outputFormat("png")
            }

            builder.toOutputStream(originalOutputStream)
        } else {
            val builder = Thumbnails.of(originalImage)
                .scale(1.0)

            if (outputFormat == "jpg") {
                builder.outputQuality(0.9).outputFormat("jpg")
            } else {
                builder.outputFormat("png")
            }

            builder.toOutputStream(originalOutputStream)
        }

        val originalProcessedBytes = originalOutputStream.toByteArray()
        val originalProcessedImage = ImageIO.read(ByteArrayInputStream(originalProcessedBytes))

        processedImages.add(
            ProcessedImage(
                bytes = originalProcessedBytes,
                width = originalProcessedImage?.width ?: originalWidth,
                height = originalProcessedImage?.height ?: originalHeight,
                contentType = contentType,
                isOriginal = true
            )
        )

        processedImages
    }

    suspend fun uploadImage(
        bytes: ByteArray,
        originalName: String
    ): List<ImageUploadResult> {
        val processedImages = processImages(bytes)

        val ulid = UlidCreator.getUlid().toString().lowercase()
        val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
        val year = now.year
        val month = now.monthNumber.toString().padStart(2, '0')

        val results = mutableListOf<ImageUploadResult>()

        for (processed in processedImages) {
            val extension = if (processed.contentType == "image/png") "png" else "jpg"

            val dimensionSuffix = if (!processed.isOriginal) {
                "_${processed.width}x${processed.height}"
            } else {
                ""
            }

            val objectKey = "images/$year/$month/$ulid$dimensionSuffix.$extension"

            val putObjectRequest = PutObjectRequest {
                bucket = config.bucketName
                key = objectKey
                contentType = processed.contentType
                // 업로드할 때마다 새 ULID로 key를 만들고 덮어쓰지 않으므로 1년 동안 캐시해도 된다.
                cacheControl = "public, max-age=31536000"
                body = ByteStream.fromBytes(processed.bytes)
            }

            s3Client.putObject(putObjectRequest)

            val url = "${config.publicUrl}/$objectKey"

            results.add(
                ImageUploadResult(
                    url = url,
                    width = processed.width,
                    height = processed.height
                )
            )
        }

        return results
    }

    suspend fun uploadImageFromUrl(url: String): List<ImageUploadResult> {
        val response = httpClient.get(url) {
            timeout {
                requestTimeoutMillis = 10000
            }
        }

        if (!response.status.isSuccess()) {
            throw IllegalArgumentException("Failed to download image from URL: ${response.status}")
        }

        val contentLength = response.headers[HttpHeaders.ContentLength]?.toLongOrNull() ?: 0
        if (contentLength > 10 * 1024 * 1024) {
            throw IllegalArgumentException("Image file is too large (max 10MB)")
        }

        val bytes = response.readBytes()
        val fileName = url.substringAfterLast('/').substringBefore('?')

        return uploadImage(bytes, fileName)
    }

    suspend fun putJson(key: String, jsonContent: String) {
        val putObjectRequest = PutObjectRequest {
            bucket = config.bucketName
            this.key = key
            contentType = "application/json"
            body = ByteStream.fromBytes(jsonContent.toByteArray(Charsets.UTF_8))
        }
        s3Client.putObject(putObjectRequest)
    }

    suspend fun getJson(key: String): String? {
        return try {
            val getObjectRequest = GetObjectRequest {
                bucket = config.bucketName
                this.key = key
            }
            s3Client.getObject(getObjectRequest) { response ->
                response.body?.decodeToString()
            }
        } catch (e: NoSuchKey) {
            null
        }
    }

    suspend fun deleteImage(imageUrl: String) {
        val objectKey = imageUrl.removePrefix(config.publicUrl).removePrefix("/")

        val deleteObjectRequest = DeleteObjectRequest {
            bucket = config.bucketName
            key = objectKey
        }

        s3Client.deleteObject(deleteObjectRequest)
    }

    private data class ProcessedImage(
        val bytes: ByteArray,
        val width: Int,
        val height: Int,
        val contentType: String,
        val isOriginal: Boolean = false
    )
}

data class S3Config(
    val region: String,
    val bucketName: String,
    val accessKeyId: String,
    val secretAccessKey: String,
    val publicUrl: String
)

data class ImageUploadResult(
    val url: String,
    val width: Int,
    val height: Int
)