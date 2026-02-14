package com.sunrei.routes.app

import com.sunrei.di.injectTagService
import com.sunrei.service.TagService
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.tagRoutes() {
    route("/tags") {
        get {
            val tagService: TagService = call.injectTagService()
            val tags = tagService.list()
            call.respond(mapOf(
                "tags" to tags,
                "totalCount" to tags.totalSize
            ))
        }
    }
}
