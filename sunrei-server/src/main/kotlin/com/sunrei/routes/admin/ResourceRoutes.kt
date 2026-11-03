package com.sunrei.routes.admin

import com.sunrei.di.injectYoutubeService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.resourceRoutes() {
    route("/resources/youtube/{channelId}") {
        get {
            val channelId = call.parameters["channelId"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "channelId is required"))

            val resource = call.injectYoutubeService().getChannelResource(channelId)
            if (resource != null) {
                call.respond(resource)
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Channel not found"))
            }
        }
    }
}
