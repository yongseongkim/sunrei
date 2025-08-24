package com.sunrei.routes

import com.sunrei.generated.dto.GetSunreiResult
import com.sunrei.generated.dto.ListSunreiResult
import com.sunrei.service.SunreiService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.sunreiRoutes() {
    val sunreiService = SunreiService()
    
    route("/sunreis") {
        get {
            val polygon = call.request.queryParameters["polygon"]
            
            val sunreis = if (polygon != null) {
                try {
                    sunreiService.findByPolygon(polygon)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid polygon format"))
                    return@get
                }
            } else {
                sunreiService.findAll()
            }
            
            println("Found ${sunreis.size} sunreis")
            
            val result = ListSunreiResult(
                sunreis = sunreis,
                totalCount = sunreis.size
            )
            call.respond(result)
        }
        
        get("/{id}") {
            val id = call.parameters["id"] ?: run {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing id parameter"))
                return@get
            }
            
            val sunrei = sunreiService.findOne(id)
            val result = GetSunreiResult(sunrei = sunrei)
            
            if (sunrei == null) {
                call.respond(HttpStatusCode.NotFound, result)
            } else {
                call.respond(result)
            }
        }
    }
}