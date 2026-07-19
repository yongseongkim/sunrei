package com.sunrei.service

import org.jetbrains.exposed.sql.DoubleColumnType
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Function
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.QueryBuilder
import org.jetbrains.exposed.sql.QueryParameter

// Parameterized PostGIS helpers — numeric values go through bind parameters
// (QueryParameter), never string interpolation. SRID is fixed at 4326.

private fun p(d: Double) = QueryParameter(d, DoubleColumnType())

/** ST_MakeEnvelope(minLng, minLat, maxLng, maxLat, 4326) as a geometry expression. */
class StMakeEnvelope(
    private val minLng: Double,
    private val minLat: Double,
    private val maxLng: Double,
    private val maxLat: Double
) : Expression<String>() {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append("ST_MakeEnvelope(")
        p(minLng).toQueryBuilder(queryBuilder)
        queryBuilder.append(", ")
        p(minLat).toQueryBuilder(queryBuilder)
        queryBuilder.append(", ")
        p(maxLng).toQueryBuilder(queryBuilder)
        queryBuilder.append(", ")
        p(maxLat).toQueryBuilder(queryBuilder)
        queryBuilder.append(", 4326)")
    }
}

/** ST_Within(geom, envelope). */
fun stWithin(geom: Expression<*>, envelope: Expression<*>): Op<Boolean> =
    object : Op<Boolean>() {
        override fun toQueryBuilder(queryBuilder: QueryBuilder) {
            queryBuilder.append("ST_Within(")
            geom.toQueryBuilder(queryBuilder)
            queryBuilder.append(", ")
            envelope.toQueryBuilder(queryBuilder)
            queryBuilder.append(")")
        }
    }

/**
 * ST_Distance(geom::geography, ST_MakePoint(lng, lat)::geography) in meters.
 * Anchored to the map center, never GPS.
 */
class StDistanceMeters(
    private val geom: Expression<*>,
    private val lng: Double,
    private val lat: Double
) : Function<Double>(DoubleColumnType()) {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append("ST_Distance(")
        geom.toQueryBuilder(queryBuilder)
        queryBuilder.append("::geography, ST_MakePoint(")
        p(lng).toQueryBuilder(queryBuilder)
        queryBuilder.append(", ")
        p(lat).toQueryBuilder(queryBuilder)
        queryBuilder.append(")::geography)")
    }
}
