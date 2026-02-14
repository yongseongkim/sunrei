package com.sunrei.auth.service

import com.sunrei.model.User
import com.sunrei.model.UserRole
import com.sunrei.service.UserService

interface IAuthRepository {
    suspend fun findByOAuthProvider(
        provider: String,
        providerUserId: String
    ): User?

    suspend fun findByEmail(email: String): User?

    suspend fun createUserWithOAuth(
        provider: String,
        providerUserId: String,
        email: String,
        name: String?,
        role: UserRole = UserRole.USER,
        providerData: Map<String, String?> = emptyMap()
    ): Pair<User, Boolean>

    suspend fun linkOAuthProvider(
        userId: String,
        provider: String,
        providerUserId: String,
        providerData: Map<String, String?> = emptyMap()
    ): Boolean

    suspend fun updateUser(
        userId: String,
        email: String,
        name: String?
    ): User

    suspend fun findById(id: String): User?

    suspend fun isAdmin(id: String): Boolean
}

class AuthRepository(
    private val userService: UserService
) : IAuthRepository {
    override suspend fun findByOAuthProvider(
        provider: String,
        providerUserId: String
    ): User? {
        return userService.findByOAuthProvider(provider, providerUserId)
    }

    override suspend fun findByEmail(email: String): User? {
        return userService.findByEmail(email)
    }

    override suspend fun createUserWithOAuth(
        provider: String,
        providerUserId: String,
        email: String,
        name: String?,
        role: UserRole,
        providerData: Map<String, String?>
    ): Pair<User, Boolean> {
        val existingUser = findByEmail(email)

        return if (existingUser != null) {
            userService.linkOAuthProvider(
                userId = existingUser.id,
                provider = provider,
                providerUserId = providerUserId,
                providerData = providerData
            )
            Pair(existingUser, false)
        } else {
            val newUser = userService.create(
                email = email,
                name = name,
                role = role
            )

            userService.linkOAuthProvider(
                userId = newUser.id,
                provider = provider,
                providerUserId = providerUserId,
                providerData = providerData
            )

            Pair(newUser, true)
        }
    }

    override suspend fun linkOAuthProvider(
        userId: String,
        provider: String,
        providerUserId: String,
        providerData: Map<String, String?>
    ): Boolean {
        return try {
            userService.linkOAuthProvider(userId, provider, providerUserId, providerData)
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun updateUser(
        userId: String,
        email: String,
        name: String?
    ): User {
        return userService.update(userId, email, name)!!
    }

    override suspend fun findById(id: String): User? {
        return userService.findById(id)
    }

    override suspend fun isAdmin(id: String): Boolean {
        return userService.isAdmin(id)
    }
}
