package com.sunrei.auth.routes

import com.sunrei.auth.models.AuthErrorResponse
import com.sunrei.auth.models.GoogleAuthRequest
import com.sunrei.auth.models.GoogleAuthResponse
import com.sunrei.auth.service.AuthService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.log
import io.ktor.server.auth.authentication
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import com.sunrei.auth.models.OAuthProvider as OAuthProviderEnum

fun Route.authRoutes(authService: AuthService) {
    route("/api/auth") {
        post("/google") {
            try {
                val request = call.receive<GoogleAuthRequest>()
                val (user, _) = authService.authenticateWithOAuth(
                    provider = OAuthProviderEnum.GOOGLE,
                    accessToken = request.idToken
                )
                val jwtToken = authService.generateJWT(user)

                call.respond(
                    HttpStatusCode.OK,
                    GoogleAuthResponse(
                        token = jwtToken,
                        user = user
                    )
                )
            } catch (e: IllegalArgumentException) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    AuthErrorResponse(
                        error = "invalid_token",
                        message = e.message ?: "Invalid Google ID token"
                    )
                )
            } catch (e: Exception) {
                call.application.log.error("Error during Google authentication", e)
                call.respond(
                    HttpStatusCode.InternalServerError,
                    AuthErrorResponse(
                        error = "internal_error",
                        message = "Authentication failed"
                    )
                )
            }
        }

        get("/me") {
            try {
                val principal = call.authentication.principal<JWTPrincipal>()
                    ?: return@get call.respond(
                        HttpStatusCode.Unauthorized,
                        AuthErrorResponse(
                            error = "unauthorized",
                            message = "Not authenticated"
                        )
                    )

                val userId = principal.payload.getClaim("userId").asString()
                val user = authService.getUserById(userId)
                    ?: return@get call.respond(
                        HttpStatusCode.NotFound,
                        AuthErrorResponse(
                            error = "user_not_found",
                            message = "User not found"
                        )
                    )

                call.respond(HttpStatusCode.OK, user)
            } catch (e: Exception) {
                call.application.log.error("Error getting user information", e)
                call.respond(
                    HttpStatusCode.InternalServerError,
                    AuthErrorResponse(
                        error = "internal_error",
                        message = "Failed to get user information"
                    )
                )
            }
        }
    }
}
