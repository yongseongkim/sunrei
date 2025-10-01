package com.sunrei.routes.app

import com.sunrei.service.TagService
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.tagRoutes() {
    val tagService = TagService()

    route("/tags") {
        get {
            val tags = tagService.list()
            call.respond(mapOf(
                "tags" to tags,
                "totalCount" to tags.size
            ))
        }
    }
}