package com.sunrei.auth.provider

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.sunrei.auth.models.OAuthTokenInfo
import com.sunrei.auth.models.OAuthUserInfo
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.formUrlEncode
import io.ktor.server.config.ApplicationConfig
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.sunrei.auth.models.OAuthProvider as OAuthProviderEnum

class GoogleOAuthProvider : IOAuthProvider {
    override val provider = OAuthProviderEnum.GOOGLE

    private var verifier: GoogleIdTokenVerifier? = null
    private var clientId: String = ""
    private var clientSecret: String = ""
    private val httpTransport = NetHttpTransport()
    private val jsonFactory = GsonFactory.getDefaultInstance()
    private lateinit var httpClient: HttpClient

    override fun initialize(config: ApplicationConfig, httpClient: HttpClient) {
        this.httpClient = httpClient
        clientId = config.property("auth.oauth.google.clientId").getString()
        clientSecret = config.property("auth.oauth.google.clientSecret").getString()
        verifier = GoogleIdTokenVerifier.Builder(
            httpTransport,
            jsonFactory
        )
            .setAudience(listOf(clientId))
            .build()
    }

    override suspend fun verifyToken(tokenInfo: OAuthTokenInfo): OAuthUserInfo {
        // If idToken is provided (and not empty), use it
        if (tokenInfo.idToken.isNullOrBlank().not()) {
            return verifyIdToken(tokenInfo.idToken)
        }

        // Otherwise, use access_token to fetch user info from userinfo endpoint
        val accessToken = tokenInfo.accessToken
            ?: throw IllegalArgumentException("Either ID token or access token is required")

        return verifyAccessToken(accessToken)
    }

    private fun verifyIdToken(idToken: String): OAuthUserInfo {
        try {
            val idTokenObj: GoogleIdToken = verifier!!.verify(idToken)
            val payload: GoogleIdToken.Payload = idTokenObj.payload

            return OAuthUserInfo(
                providerId = payload.subject,
                provider = OAuthProviderEnum.GOOGLE,
                email = payload.email ?: throw IllegalArgumentException("Email not found in token"),
                name = payload["name"] as? String,
                avatarUrl = payload["picture"] as? String,
                additionalInfo = mapOf(
                    "locale" to (payload["locale"] as? String),
                    "family_name" to (payload["family_name"] as? String),
                    "given_name" to (payload["given_name"] as? String),
                    "picture" to (payload["picture"] as? String)
                ).filterValues { !it.isNullOrEmpty() }
            )
        } catch (e: Exception) {
            throw IllegalArgumentException("Invalid Google ID token: ${e.message}", e)
        }
    }

    private suspend fun verifyAccessToken(accessToken: String): OAuthUserInfo {
        try {
            val response = httpClient.get("https://www.googleapis.com/oauth2/v3/userinfo") {
                headers {
                    append("Authorization", "Bearer $accessToken")
                }
            }

            val responseBody = response.bodyAsText()
            val json = Json { ignoreUnknownKeys = true }
            val userData = json.decodeFromString<JsonObject>(responseBody)

            return OAuthUserInfo(
                providerId = userData["sub"]?.jsonPrimitive?.content
                    ?: throw IllegalArgumentException("sub not found in user info"),
                provider = OAuthProviderEnum.GOOGLE,
                email = userData["email"]?.jsonPrimitive?.content
                    ?: throw IllegalArgumentException("email not found in user info"),
                name = userData["name"]?.jsonPrimitive?.content,
                avatarUrl = userData["picture"]?.jsonPrimitive?.content,
                additionalInfo = mapOf(
                    "locale" to userData["locale"]?.jsonPrimitive?.content,
                    "family_name" to userData["family_name"]?.jsonPrimitive?.content,
                    "given_name" to userData["given_name"]?.jsonPrimitive?.content,
                    "picture" to userData["picture"]?.jsonPrimitive?.content
                ).filterValues { !it.isNullOrEmpty() }
            )
        } catch (e: Exception) {
            throw IllegalArgumentException("Invalid Google access token: ${e.message}", e)
        }
    }

    override suspend fun exchangeCodeForTokens(
        code: String,
        redirectUri: String,
        state: String?
    ): OAuthTokenInfo {
        val response = httpClient.post("https://oauth2.googleapis.com/token") {
            headers {
                append("Content-Type", "application/x-www-form-urlencoded")
            }
            setBody(
                listOf(
                    "client_id" to clientId,
                    "client_secret" to clientSecret,
                    "code" to code,
                    "redirect_uri" to redirectUri,
                    "grant_type" to "authorization_code"
                ).formUrlEncode()
            )
        }

        val responseBody = response.bodyAsText()
        val json = Json { ignoreUnknownKeys = true }
        val tokenData = json.decodeFromString<JsonObject>(responseBody)

        return OAuthTokenInfo(
            accessToken = tokenData["access_token"]?.jsonPrimitive?.content,
            idToken = tokenData["id_token"]?.jsonPrimitive?.content,
            refreshToken = tokenData["refresh_token"]?.jsonPrimitive?.content,
            expiresIn = tokenData["expires_in"]?.jsonPrimitive?.content?.toLongOrNull(),
            provider = OAuthProviderEnum.GOOGLE
        )
    }

    override fun getAuthorizationUrl(
        redirectUri: String,
        scopes: List<String>,
        state: String?
    ): String {
        val defaultScopes = listOf("openid", "email", "profile")
        val finalScopes = (scopes + defaultScopes).distinct()

        return buildString {
            append("https://accounts.google.com/o/oauth2/v2/auth?")
            append("client_id=$clientId")
            append("&redirect_uri=$redirectUri")
            append("&response_type=code")
            append("&scope=${finalScopes.joinToString(" ")}")
            append("&access_type=offline")
            append("&prompt=consent")
            if (state != null) {
                append("&state=$state")
            }
        }
    }

    override suspend fun refreshAccessToken(refreshToken: String): OAuthTokenInfo {
        throw NotImplementedError("Token refresh not implemented yet")
    }

    override suspend fun revokeTokens(accessToken: String): Boolean {
        return try {
            true
        } catch (e: Exception) {
            false
        }
    }
}
