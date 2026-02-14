package com.sunrei.auth.provider

import com.sunrei.auth.models.OAuthProvider as OAuthProviderEnum
import com.sunrei.auth.models.OAuthTokenInfo
import com.sunrei.auth.models.OAuthUserInfo
import io.ktor.client.HttpClient
import io.ktor.server.config.ApplicationConfig

interface IOAuthProvider {
    val provider: OAuthProviderEnum

    fun initialize(config: ApplicationConfig, httpClient: HttpClient)

    suspend fun verifyToken(tokenInfo: OAuthTokenInfo): OAuthUserInfo

    suspend fun exchangeCodeForTokens(
        code: String,
        redirectUri: String,
        state: String? = null
    ): OAuthTokenInfo

    fun getAuthorizationUrl(
        redirectUri: String,
        scopes: List<String>,
        state: String? = null
    ): String

    suspend fun refreshAccessToken(refreshToken: String): OAuthTokenInfo

    suspend fun revokeTokens(accessToken: String): Boolean
}
