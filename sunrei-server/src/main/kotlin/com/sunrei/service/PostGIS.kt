package com.sunrei.service

import org.jetbrains.exposed.sql.DoubleColumnType
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Function
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.QueryBuilder
import org.jetbrains.exposed.sql.QueryParameter

// Exposed가 PostGIS 함수를 지원하지 않아 SQL을 직접 만든다.
// 좌표는 SQL 문자열에 이어 붙이지 않고 QueryParameter로 바인딩하며, SRID는 4326으로 고정한다.

private fun p(d: Double) = QueryParameter(d, DoubleColumnType())

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
