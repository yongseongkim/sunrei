package com.sunrei.routes.admin

import com.sunrei.service.ConflictException
import com.sunrei.service.NotFoundException
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond

/** 수집 라우트의 서비스 오류를 404(없음), 409(충돌), 그 밖에는 400으로 응답한다. */
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
