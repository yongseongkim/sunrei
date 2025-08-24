package com.sunrei.model

object Places : ULIDTimestampedTable("place", "P") {
    val name = varchar("name", 128)
    val address = varchar("address", 255)
    val latitude = float("latitude")
    val longitude = float("longitude")
    val googleMapsId = varchar("google_maps_id", 255).nullable()
}

data class PlaceEntity(
    val id: String,
    val name: String,
    val address: String,
    val latitude: Float,
    val longitude: Float,
    val googleMapsId: String? = null
)