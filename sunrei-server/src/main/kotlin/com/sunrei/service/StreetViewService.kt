package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.database.SunreiSpots
import com.sunrei.database.Sunreis
import com.sunrei.generated.dto.admin.StreetViewStaleReason
import com.sunrei.generated.dto.admin.SunreiSpotStreetViewDTO
import com.sunrei.generated.dto.admin.UpdateSunreiSpotStreetViewRequest
import com.sunrei.model.*
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import java.security.MessageDigest

class StreetViewService {
    fun get(sunreiId: String, spotId: String): SunreiSpotStreetViewDTO = transaction {
        val (spot, place) = load(sunreiId, spotId, false)
        state(spot, place)
    }

    fun update(sunreiId: String, spotId: String, request: UpdateSunreiSpotStreetViewRequest): SunreiSpotStreetViewDTO = transaction {
        // Same lock order as Sunrei updates: parent, Spot, then the referenced Place.
        val (spot, place) = load(sunreiId, spotId, true)
        val current = state(spot, place)
        if (current.revision != request.expectedRevision) throw ConflictException("The viewpoint or its Place/content binding changed", spotId)
        val input = request.streetView
        val saved = input?.let {
            val panoramaId = it.panoramaId.trim()
            require(panoramaId.isNotBlank() && panoramaId.length <= 2048 && panoramaId != place.googleMapsId) { "Invalid panorama ID" }
            require(it.heading.isFinite() && it.pitch.isFinite() && it.zoom.isFinite()) { "Viewpoint values must be finite" }
            require(it.pitch in -90.0..90.0 && it.zoom in 0.0..3.0) { "Viewpoint out of range" }
            val anchor = it.searchAnchor?.let { a ->
                require(a.latitude.isFinite() && a.longitude.isFinite() && a.latitude in -90.0..90.0 && a.longitude in -180.0..180.0) { "Search anchor out of range" }
                StreetViewAnchor(a.latitude, a.longitude)
            }
            SavedStreetView(StreetViewSettings(panoramaId, ((it.heading % 360) + 360) % 360, it.pitch, it.zoom, Clock.System.now(), anchor), binding(spot, place))
        }
        SunreiSpots.update({ SunreiSpots.id eq spotId }) {
            it[streetView] = saved
            it[streetViewRevision] = spot[SunreiSpots.streetViewRevision] + 1
            it[updatedAt] = Clock.System.now()
        }
        val updated = SunreiSpots.select { SunreiSpots.id eq spotId }.first()
        state(updated, place)
    }

    private fun load(sunreiId: String, spotId: String, lock: Boolean): Pair<ResultRow, Place> {
        val parentQuery = Sunreis.select { (Sunreis.id eq sunreiId) and Sunreis.deletedAt.isNull() }
        if (lock) parentQuery.forUpdate()
        parentQuery.firstOrNull() ?: throw NotFoundException("Sunrei not found")
        val spotQuery = SunreiSpots.select { (SunreiSpots.id eq spotId) and (SunreiSpots.sunreiId eq sunreiId) and SunreiSpots.deletedAt.isNull() }
        if (lock) spotQuery.forUpdate()
        val spot = spotQuery.firstOrNull() ?: throw NotFoundException("Spot not found in this Sunrei")
        val placeQuery = Places.select { (Places.id eq spot[SunreiSpots.placeId]) and Places.deletedAt.isNull() }
        if (lock) placeQuery.forUpdate()
        val place = placeQuery.firstOrNull()?.toPlace() ?: throw NotFoundException("Place not found")
        return spot to place
    }

    private fun state(spot: ResultRow, place: Place): SunreiSpotStreetViewDTO {
        val saved = spot[SunreiSpots.streetView]
        val current = binding(spot, place)
        val reasons = saved?.let { staleReasons(it.binding, current) } ?: emptyList()
        val payload = Json.encodeToString(current) + ":" + spot[SunreiSpots.streetViewRevision]
        val revision = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }
        return SunreiSpotStreetViewDTO(spotId = spot[SunreiSpots.id], streetView = saved?.settings?.toAdminDTO(), isStale = reasons.isNotEmpty(), staleReasons = reasons, revision = revision)
    }

    companion object {
        private fun binding(spot: ResultRow, place: Place) = StreetViewBinding(place.id, place.latitude, place.longitude, place.googleMapsId, spot[SunreiSpots.sourceLink])

        private fun staleReasons(saved: StreetViewBinding, current: StreetViewBinding): List<StreetViewStaleReason> = buildList {
            if (saved.placeId != current.placeId) add(StreetViewStaleReason.PLACE_CHANGED)
            if (saved.latitude != current.latitude || saved.longitude != current.longitude) add(StreetViewStaleReason.PLACE_LOCATION_CHANGED)
            if (saved.googleMapsId != current.googleMapsId) add(StreetViewStaleReason.GOOGLE_PLACE_ID_CHANGED)
            if (saved.sourceLink != current.sourceLink) add(StreetViewStaleReason.SOURCE_LINK_CHANGED)
        }

        fun publicView(row: ResultRow): StreetViewSettings? {
            if (row[Places.deletedAt] != null || row[SunreiSpots.deletedAt] != null) return null
            val saved = row[SunreiSpots.streetView] ?: return null
            return saved.settings.takeIf { staleReasons(saved.binding, binding(row, row.toPlace())).isEmpty() }
        }
    }
}

fun StreetViewSettings.toAdminDTO() = com.sunrei.generated.dto.admin.StreetViewDTO(
    panoramaId = panoramaId, heading = heading, pitch = pitch, zoom = zoom, reviewedAt = reviewedAt,
    searchAnchor = searchAnchor?.let { com.sunrei.generated.dto.admin.StreetViewAnchor(it.latitude, it.longitude) }
)

fun StreetViewSettings.toPublicDTO() = com.sunrei.generated.dto.app.StreetViewDTO(
    panoramaId = panoramaId, heading = heading, pitch = pitch, zoom = zoom, reviewedAt = reviewedAt,
    searchAnchor = searchAnchor?.let { com.sunrei.generated.dto.app.StreetViewAnchor(it.latitude, it.longitude) }
)
