package com.sunrei.plugins

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.server.application.Application
import io.ktor.server.auth.authentication
import io.ktor.server.auth.jwt.JWTCredential
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.jwt.jwt
import io.ktor.server.config.ApplicationConfig

fun Application.configureAuthentication(config: ApplicationConfig) {
    val jwtSecret = config.property("auth.jwt.secret").getString()
    val jwtIssuer = config.property("auth.jwt.issuer").getString()

    val jwtAlgorithm = Algorithm.HMAC256(jwtSecret)
    val jwtVerifier: JWTVerifier = JWT
        .require(jwtAlgorithm)
        .withIssuer(jwtIssuer)
        .build()

    authentication {
        jwt("jwt") {
            verifier(jwtVerifier)

            validate { credential: JWTCredential ->
                val userId = credential.payload.getClaim("userId").asString()
                val email = credential.payload.getClaim("email").asString()
                val role = credential.payload.getClaim("role").asString()

                if (userId.isNotBlank() && email.isNotBlank()) {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }

        jwt("admin-auth") {
            verifier(jwtVerifier)

            validate { credential: JWTCredential ->
                val userId = credential.payload.getClaim("userId").asString()
                val email = credential.payload.getClaim("email").asString()
                val role = credential.payload.getClaim("role").asString()

                if (userId.isNotBlank() && email.isNotBlank() && role == "admin") {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }
    }
}
