package com.sunrei.model

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

enum class PlaceCategory { RESTAURANT, CAFE, BAR, SHOP, STAY, SIGHTSEEING, PARK, TRANSPORT, OTHER }

@Serializable
data class StreetViewAnchor(val latitude: Double, val longitude: Double)

@Serializable
data class StreetViewSettings(
    val panoramaId: String,
    val heading: Double,
    val pitch: Double,
    val zoom: Double,
    val reviewedAt: Instant,
    val searchAnchor: StreetViewAnchor? = null
)

/** Floats match the precision of the persisted Place coordinates. */
@Serializable
data class StreetViewBinding(
    val placeId: String,
    val latitude: Float,
    val longitude: Float,
    val googleMapsId: String?,
    val sourceLink: String?
)

@Serializable
data class SavedStreetView(val settings: StreetViewSettings, val binding: StreetViewBinding)
