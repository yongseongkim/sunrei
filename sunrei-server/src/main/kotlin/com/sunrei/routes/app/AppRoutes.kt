package com.sunrei.routes.app

import io.ktor.server.routing.Route
import io.ktor.server.routing.route

fun Route.appRoutes() {
    route("/api") {
        mapRoutes()
        appSourceRoutes()
        placeRoutes()
        sunreiRoutes()
        searchRoutes()
        tagRoutes()
    }
}
