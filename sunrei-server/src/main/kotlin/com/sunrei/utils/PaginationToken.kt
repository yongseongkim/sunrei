package com.sunrei.utils

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import com.auth0.jwt.interfaces.JWTVerifier
import java.time.Instant
import java.time.temporal.ChronoUnit

class PaginationToken(private val secret: String) {
    private val algorithm = Algorithm.HMAC256(secret)
    private val verifier: JWTVerifier = JWT.require(algorithm)
        .withIssuer(ISSUER)
        .build()
    
    fun createToken(
        offset: Int, 
        size: Int, 
        additionalData: Map<String, String> = emptyMap()
    ): String {
        val builder = JWT.create()
            .withIssuer(ISSUER)
            .withClaim("offset", offset)
            .withClaim("size", size)
            .withExpiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
            
        additionalData.forEach { (key, value) ->
            builder.withClaim(key, value)
        }
        
        return builder.sign(algorithm)
    }
    
    fun decodeToken(token: String?): TokenData? {
        if (token == null) return null
        
        return try {
            val decodedJWT = verifier.verify(token)
            
            val offset = decodedJWT.getClaim("offset").asInt() ?: return null
            val size = decodedJWT.getClaim("size").asInt() ?: return null
            
            val additionalData = decodedJWT.claims
                .filterKeys { it !in setOf("offset", "size", "iss", "exp") }
                .mapValues { it.value.asString() ?: "" }
                .filterValues { it.isNotEmpty() }
            
            TokenData(offset, size, additionalData)
        } catch (e: JWTVerificationException) {
            null
        } catch (e: Exception) {
            null
        }
    }
    
    fun createNextPageToken(currentOffset: Int, size: Int, totalElements: Int): String? {
        val nextOffset = currentOffset + size
        return if (nextOffset < totalElements) {
            createToken(nextOffset, size)
        } else {
            null
        }
    }
    
    fun isValid(token: String?): Boolean {
        return decodeToken(token) != null
    }
    
    data class TokenData(
        val offset: Int,
        val size: Int,
        val additionalData: Map<String, String> = emptyMap()
    )
    
    companion object {
        private const val ISSUER = "sunrei-page-token"
    }
}