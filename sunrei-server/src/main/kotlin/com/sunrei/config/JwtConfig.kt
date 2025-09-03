package com.sunrei.config

import io.ktor.server.config.ApplicationConfig

object JwtConfig {
    private lateinit var pageTokenSecret: String
    
    fun init(config: ApplicationConfig) {
        pageTokenSecret = config.propertyOrNull("jwt.pageToken.secret")?.getString() 
            ?: "sunrei-page-token-secret-change-in-production"
    }
    
    fun getPageTokenSecret(): String = pageTokenSecret
}