package com.sunrei.auth.service

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.sunrei.auth.models.OAuthProvider
import com.sunrei.auth.models.OAuthTokenInfo
import com.sunrei.auth.models.OAuthUserInfo
import com.sunrei.auth.provider.OAuthProviderFactory
import com.sunrei.model.UserRole
import io.ktor.server.config.*
import java.util.*
import java.util.concurrent.TimeUnit

interface IAuthService {
    suspend fun verifyOAuthToken(tokenInfo: OAuthTokenInfo): OAuthUserInfo

    suspend fun authenticateWithOAuth(
        provider: OAuthProvider,
        code: String? = null,
        idToken: String? = null,
        accessToken: String? = null,
        refreshToken: String? = null,
        redirectUri: String? = null,
        state: String? = null
    ): Pair<com.sunrei.model.User, Boolean>

    suspend fun findOrCreateOAuthUser(userInfo: OAuthUserInfo): Pair<com.sunrei.model.User, Boolean>

    fun generateJWT(user: com.sunrei.model.User): String

    suspend fun getUserById(userId: String): com.sunrei.model.User?

    suspend fun isAdminUser(userId: String): Boolean

    suspend fun verifyGoogleToken(idToken: String): com.sunrei.auth.models.GoogleTokenInfo

    suspend fun findOrCreateGoogleUser(
        tokenInfo: com.sunrei.auth.models.GoogleTokenInfo
    ): com.sunrei.model.User
}

class AuthService(
    private val config: ApplicationConfig,
    private val authRepository: IAuthRepository = AuthRepository()
) : IAuthService {
    private val jwtSecret = config.property("auth.jwt.secret").getString()
    private val jwtIssuer = config.property("auth.jwt.issuer").getString()
    private val jwtExpiration = config.property("auth.jwt.expiration").getString().toLong()

    override suspend fun verifyOAuthToken(tokenInfo: OAuthTokenInfo): OAuthUserInfo {
        val provider = OAuthProviderFactory.getProvider(tokenInfo.provider)
            ?: throw IllegalArgumentException("Unsupported OAuth provider: ${tokenInfo.provider}")

        return provider.verifyToken(tokenInfo)
    }

    override suspend fun authenticateWithOAuth(
        provider: OAuthProvider,
        code: String?,
        idToken: String?,
        accessToken: String?,
        refreshToken: String?,
        redirectUri: String?,
        state: String?
    ): Pair<com.sunrei.model.User, Boolean> {
        val providerImpl = OAuthProviderFactory.getProvider(provider)
            ?: throw IllegalArgumentException("Unsupported OAuth provider: $provider")

        // Handle access token (from GIS Token Client)
        if (accessToken != null && provider == OAuthProvider.GOOGLE) {
            val tokenInfo = OAuthTokenInfo(
                accessToken = accessToken,
                idToken = null,
                refreshToken = null,
                expiresIn = null,
                provider = provider
            )
            val userInfo = verifyOAuthToken(tokenInfo)
            return findOrCreateOAuthUser(userInfo)
        }

        // Handle id token (from legacy flow)
        if (idToken != null && provider == OAuthProvider.GOOGLE) {
            val tokenInfo = OAuthTokenInfo(
                accessToken = null,
                idToken = idToken,
                refreshToken = null,
                expiresIn = null,
                provider = provider
            )
            val userInfo = verifyOAuthToken(tokenInfo)
            return findOrCreateOAuthUser(userInfo)
        }

        if (code != null && redirectUri != null) {
            val tokenInfo = providerImpl.exchangeCodeForTokens(code, redirectUri, state)
            val userInfo = providerImpl.verifyToken(tokenInfo)
            return findOrCreateOAuthUser(userInfo)
        }

        throw IllegalArgumentException("Invalid OAuth authentication parameters")
    }

    override suspend fun findOrCreateOAuthUser(userInfo: OAuthUserInfo): Pair<com.sunrei.model.User, Boolean> {
        val existingUser = authRepository.findByOAuthProvider(
            provider = userInfo.provider.name.lowercase(),
            providerUserId = userInfo.providerId
        )

        if (existingUser != null) {
            authRepository.updateUser(
                userId = existingUser.id,
                email = userInfo.email,
                name = userInfo.name
            )
            return Pair(existingUser, false)
        }

        val existingUserByEmail = authRepository.findByEmail(userInfo.email)
        if (existingUserByEmail != null) {
            authRepository.linkOAuthProvider(
                userId = existingUserByEmail.id,
                provider = userInfo.provider.name.lowercase(),
                providerUserId = userInfo.providerId,
                providerData = userInfo.additionalInfo
            )
            return Pair(existingUserByEmail, false)
        }

        return authRepository.createUserWithOAuth(
            provider = userInfo.provider.name.lowercase(),
            providerUserId = userInfo.providerId,
            email = userInfo.email,
            name = userInfo.name,
            role = UserRole.USER,
            providerData = userInfo.additionalInfo
        )
    }

    override fun generateJWT(user: com.sunrei.model.User): String {
        val algorithm = Algorithm.HMAC256(jwtSecret)
        val expirationDate = Date(System.currentTimeMillis() + TimeUnit.DAYS.toMillis(jwtExpiration))

        return JWT.create()
            .withIssuer(jwtIssuer)
            .withSubject(user.id)
            .withClaim("userId", user.id)
            .withClaim("email", user.email)
            .withClaim("role", user.role.name.lowercase())
            .withExpiresAt(expirationDate)
            .sign(algorithm)
    }

    override suspend fun getUserById(userId: String): com.sunrei.model.User? {
        return authRepository.findById(userId)
    }

    override suspend fun isAdminUser(userId: String): Boolean {
        return authRepository.isAdmin(userId)
    }

    override suspend fun verifyGoogleToken(idToken: String): com.sunrei.auth.models.GoogleTokenInfo {
        val userInfo = verifyOAuthToken(
            OAuthTokenInfo(
                accessToken = null,
                idToken = idToken,
                refreshToken = null,
                expiresIn = null,
                provider = OAuthProvider.GOOGLE
            )
        )

        return com.sunrei.auth.models.GoogleTokenInfo(
            googleId = userInfo.providerId,
            email = userInfo.email,
            name = userInfo.name,
            avatarUrl = userInfo.avatarUrl
        )
    }

    override suspend fun findOrCreateGoogleUser(
        tokenInfo: com.sunrei.auth.models.GoogleTokenInfo
    ): com.sunrei.model.User {
        val userInfo = OAuthUserInfo(
            providerId = tokenInfo.googleId,
            provider = OAuthProvider.GOOGLE,
            email = tokenInfo.email,
            name = tokenInfo.name,
            avatarUrl = tokenInfo.avatarUrl
        )

        return findOrCreateOAuthUser(userInfo).first
    }
}
