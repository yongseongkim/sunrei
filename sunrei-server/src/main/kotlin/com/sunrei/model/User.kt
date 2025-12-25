package com.sunrei.model

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val email: String,
    val name: String?,
    val role: UserRole,
    val createdAt: Instant,
    val updatedAt: Instant
)

@Serializable
enum class UserRole {
    USER,
    ADMIN
}
