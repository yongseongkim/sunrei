package com.sunrei.database

import org.jetbrains.exposed.sql.kotlin.datetime.timestamp
import org.jetbrains.exposed.sql.ReferenceOption

// "user" is a Postgres reserved word; Exposed quotes it automatically in generated SQL.
object UserTable : ULIDTimestampedTable("user", "U") {
    val email = varchar("email", 255).uniqueIndex()
    val name = varchar("name", 255).nullable()
    val role = varchar("role", 20).default("user")
        .check { it inList(listOf("user", "admin")) }
}

object OAuthProviderTable : ULIDTimestampedTable("oauth_provider", "OAUTH") {
    val userId = varchar("user_id", 32).references(UserTable.id, ReferenceOption.CASCADE)
    val provider = varchar("provider", 64)
    val providerUserId = varchar("provider_user_id", 64)
    val providerData = text("provider_data").nullable()
    val accessToken = varchar("access_token", 255).nullable()
    val refreshToken = varchar("refresh_token", 255).nullable()
    val expiresAt = timestamp("expires_at").nullable()

    init {
        uniqueIndex(userId, provider)
        uniqueIndex(provider, providerUserId)
    }
}
