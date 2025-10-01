package com.sunrei.model

import kotlinx.datetime.Instant

data class Place(
    val id: String,
    val name: String,
    val address: String,
    val latitude: Float,
    val longitude: Float,
    val isClosed: Boolean,
    val closedReason: String? = null,
    val closedAt: Instant? = null,
    val notes: String? = null,
    val deletedAt: Instant? = null
)