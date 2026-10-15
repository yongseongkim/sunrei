package com.sunrei.routes.admin

import com.sunrei.service.ConflictException
import com.sunrei.service.NotFoundException
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond

/** Map service errors of the collection routes: 404 not found, 409 conflict, 400 otherwise. */
internal suspend fun ApplicationCall.handleErrors(block: suspend () -> Unit) {
    try {
        block()
    } catch (e: NotFoundException) {
        respond(HttpStatusCode.NotFound, mapOf("error" to e.message))
    } catch (e: ConflictException) {
        respond(HttpStatusCode.Conflict, mapOf("error" to e.message, "existingId" to e.existingId))
    } catch (e: Exception) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid request")))
    }
}
