package com.sunrei

import com.sunrei.routes.sunreiRoutes
import com.sunrei.routes.sunreiSpotRoutes
import com.sunrei.routes.tagRoutes
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        sunreiRoutes()
        sunreiSpotRoutes()
        tagRoutes()
        
        get("/") {
            call.respondText("Sunrei API Server")
        }
    }
}
