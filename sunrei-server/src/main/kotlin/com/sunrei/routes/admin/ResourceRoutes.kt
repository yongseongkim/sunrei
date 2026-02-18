package com.sunrei.routes.admin

import com.sunrei.di.injectS3Service
import com.sunrei.service.S3Service
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

fun Route.resourceRoutes() {
    route("/resources/youtube/{channelId}") {
        get {
            val s3Service: S3Service = call.injectS3Service()
            val channelId = call.parameters["channelId"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "channelId is required"))

            val json = s3Service.getJson("youtube/$channelId.json")
            if (json != null) {
                call.respondText(json, io.ktor.http.ContentType.Application.Json)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Channel registry not found"))
            }
        }

        put {
            val s3Service: S3Service = call.injectS3Service()
            val channelId = call.parameters["channelId"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "channelId is required"))

            val body = call.receiveText()

            // Validate that the body is valid JSON
            try {
                Json.decodeFromString<JsonElement>(body)
            } catch (e: Exception) {
                return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
            }

            s3Service.putJson("youtube/$channelId.json", body)
            call.respond(HttpStatusCode.OK, mapOf("message" to "Channel registry saved"))
        }
    }
}
