package com.sunrei.auth.provider

import com.sunrei.auth.models.OAuthProvider as OAuthProviderEnum
import io.ktor.server.config.ApplicationConfig
import org.slf4j.LoggerFactory

object OAuthProviderFactory {
    private val logger = LoggerFactory.getLogger(OAuthProviderFactory::class.java)

    private val providers = mutableMapOf<OAuthProviderEnum, IOAuthProvider>()

    fun initialize(config: ApplicationConfig) {
        try {
            val googleProvider = GoogleOAuthProvider()
            googleProvider.initialize(config)
            providers[OAuthProviderEnum.GOOGLE] = googleProvider
            logger.info("Google OAuth provider initialized")
        } catch (e: Exception) {
            logger.error("Failed to initialize Google OAuth provider", e)
            throw e
        }
    }

    fun getProvider(provider: OAuthProviderEnum): IOAuthProvider? {
        return providers[provider]
    }

    fun getAvailableProviders(): List<OAuthProviderEnum> {
        return providers.keys.toList()
    }
}
