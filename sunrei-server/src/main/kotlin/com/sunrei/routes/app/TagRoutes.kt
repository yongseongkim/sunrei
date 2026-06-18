package com.sunrei.routes.app

import com.sunrei.di.injectTagService
import com.sunrei.routes.app.converter.toDTO
import com.sunrei.service.TagService
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.tagRoutes() {
    route("/tags") {
        get {
            // Public bilingual tag list (powers client-side tag filter in Phase B).
            val tagService: TagService = call.injectTagService()
            call.respond(tagService.listAll().map { it.toDTO() })
        }
    }
}
