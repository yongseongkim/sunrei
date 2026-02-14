package com.sunrei.auth.provider

import com.sunrei.auth.models.OAuthProvider as OAuthProviderEnum
import io.ktor.client.HttpClient
import io.ktor.server.config.ApplicationConfig
import org.slf4j.LoggerFactory

class OAuthProviderFactory(
    config: ApplicationConfig,
    httpClient: HttpClient
) {
    private val logger = LoggerFactory.getLogger(OAuthProviderFactory::class.java)

    private val providers = mutableMapOf<OAuthProviderEnum, IOAuthProvider>()

    init {
        try {
            val googleProvider = GoogleOAuthProvider()
            googleProvider.initialize(config, httpClient)
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
