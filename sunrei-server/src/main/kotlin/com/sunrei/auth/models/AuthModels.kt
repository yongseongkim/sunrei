package com.sunrei.auth.models

import com.sunrei.model.User
import kotlinx.serialization.Serializable

@Serializable
enum class OAuthProvider {
    GOOGLE
}

@Serializable
data class OAuthUserInfo(
    val providerId: String,
    val provider: OAuthProvider,
    val email: String,
    val name: String?,
    val avatarUrl: String?,
    val additionalInfo: Map<String, String?> = emptyMap()
)

@Serializable
data class OAuthTokenInfo(
    val accessToken: String?,
    val idToken: String?,
    val refreshToken: String?,
    val expiresIn: Long?,
    val provider: OAuthProvider
)

@Serializable
data class OAuthAuthRequest(
    val provider: OAuthProvider,
    val code: String?,
    val idToken: String?,
    val accessToken: String?,
    val refreshToken: String? = null,
    val state: String?
)

@Serializable
data class OAuthAuthResponse(
    val accessToken: String,
    val expiresIn: Long = 3600,
    val user: User,
    val isNewUser: Boolean = false
)

@Serializable
data class RefreshTokenResponse(
    val accessToken: String,
    val expiresIn: Long = 3600
)

@Serializable
data class GoogleAuthRequest(
    val idToken: String
)

@Serializable
data class GoogleAuthResponse(
    val token: String,
    val user: User
)

@Serializable
data class GoogleTokenInfo(
    val googleId: String,
    val email: String,
    val name: String?,
    val avatarUrl: String?
)

@Serializable
data class GoogleOAuthCallbackRequest(
    val code: String
)

@Serializable
data class OAuthCallbackResponse(
    val id_token: String?,
    val access_token: String,
    val refresh_token: String?,
    val expires_in: Long,
    val user: User,
    val isNewUser: Boolean
)

@Serializable
data class GoogleAuthCodeRequest(
    val code: String,
    val redirectUri: String
)

@Serializable
data class AuthErrorResponse(
    val error: String,
    val message: String? = null
)
