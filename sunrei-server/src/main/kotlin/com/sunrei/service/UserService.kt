package com.sunrei.service

import com.sunrei.database.OAuthProviderTable
import com.sunrei.database.UserTable
import com.sunrei.database.insertAndGetId
import com.sunrei.model.User
import com.sunrei.model.UserRole
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class UserService {
    private val json = Json { ignoreUnknownKeys = true }

    fun findById(id: String): User? = transaction {
        UserTable.select { UserTable.id eq id }
            .map { it.toUser() }
            .singleOrNull()
    }

    fun findByEmail(email: String): User? = transaction {
        UserTable.select { UserTable.email eq email }
            .map { it.toUser() }
            .singleOrNull()
    }

    fun findByOAuthProvider(
        provider: String,
        providerUserId: String
    ): User? = transaction {
        (UserTable innerJoin OAuthProviderTable)
            .select {
                (OAuthProviderTable.provider eq provider) and
                        (OAuthProviderTable.providerUserId eq providerUserId)
            }
            .map { it.toUser() }
            .singleOrNull()
    }

    fun create(
        email: String,
        name: String?,
        role: UserRole = UserRole.USER
    ): User = transaction {
        val userId = UserTable.insertAndGetId {
            it[UserTable.email] = email
            it[UserTable.name] = name
            it[UserTable.role] = role.toDbString()
        }

        UserTable.select { UserTable.id eq userId }
            .map { it.toUser() }
            .single()
    }

    fun update(
        id: String,
        email: String,
        name: String?
    ): User? = transaction {
        UserTable.update({ UserTable.id eq id }) {
            it[UserTable.email] = email
            it[UserTable.name] = name
            it[UserTable.updatedAt] = Clock.System.now()
        }

        UserTable.select { UserTable.id eq id }
            .map { it.toUser() }
            .singleOrNull()
    }

    fun linkOAuthProvider(
        userId: String,
        provider: String,
        providerUserId: String,
        providerData: Map<String, String?> = emptyMap(),
        accessToken: String? = null,
        refreshToken: String? = null,
        expiresAt: Instant? = null
    ) = transaction {
        OAuthProviderTable.insertAndGetId {
            it[OAuthProviderTable.userId] = userId
            it[OAuthProviderTable.provider] = provider
            it[OAuthProviderTable.providerUserId] = providerUserId
            it[OAuthProviderTable.providerData] = json.encodeToString(providerData)
            it[OAuthProviderTable.accessToken] = accessToken
            it[OAuthProviderTable.refreshToken] = refreshToken
            it[OAuthProviderTable.expiresAt] = expiresAt
        }
    }

    fun updateOAuthTokens(
        provider: String,
        providerUserId: String,
        accessToken: String? = null,
        refreshToken: String? = null,
        expiresAt: Instant? = null
    ) = transaction {
        OAuthProviderTable.update({
            (OAuthProviderTable.provider eq provider) and
                    (OAuthProviderTable.providerUserId eq providerUserId)
        }) {
            it[OAuthProviderTable.accessToken] = accessToken
            it[OAuthProviderTable.refreshToken] = refreshToken
            it[OAuthProviderTable.expiresAt] = expiresAt
            it[OAuthProviderTable.updatedAt] = Clock.System.now()
        }
    }

    fun unlinkOAuthProvider(userId: String, provider: String): Boolean = transaction {
        OAuthProviderTable.deleteWhere {
            (OAuthProviderTable.userId eq userId) and
                    (OAuthProviderTable.provider eq provider)
        } > 0
    }

    fun getOAuthProviders(userId: String): List<Map<String, Any?>> = transaction {
        OAuthProviderTable.select { OAuthProviderTable.userId eq userId }
            .map {
                mapOf(
                    "provider" to it[OAuthProviderTable.provider],
                    "providerUserId" to it[OAuthProviderTable.providerUserId],
                    "providerData" to it[OAuthProviderTable.providerData]?.let { parseProviderData(it) },
                    "expiresAt" to it[OAuthProviderTable.expiresAt],
                    "createdAt" to it[OAuthProviderTable.createdAt]
                )
            }
    }

    private fun parseProviderData(jsonString: String): Map<String, String?> {
        return try {
            json.decodeFromString<Map<String, String?>>(jsonString)
        } catch (e: Exception) {
            emptyMap()
        }
    }

    fun isAdmin(id: String): Boolean = transaction {
        UserTable.select { (UserTable.id eq id) and (UserTable.role eq "admin") }
            .count() > 0
    }
}

fun String?.toUserRole(): UserRole = when (this?.lowercase()) {
    "user" -> UserRole.USER
    "admin" -> UserRole.ADMIN
    else -> UserRole.USER
}

fun UserRole.toDbString(): String = this.name.lowercase()

fun org.jetbrains.exposed.sql.ResultRow.toUser(): User {
    return User(
        id = this[UserTable.id].toString(),
        email = this[UserTable.email],
        name = this[UserTable.name],
        role = this[UserTable.role].toUserRole(),
        createdAt = this[UserTable.createdAt],
        updatedAt = this[UserTable.updatedAt]
    )
}
