package com.sunrei.service

import com.sunrei.database.Places
import com.sunrei.model.Place
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.QueryBuilder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

class PlaceService {

    fun listByPolygon(polygonWKT: String, limit: Int? = null): List<Place> = transaction {
        // TODO: 폴리곤 안에 포함된 장소가 너무 많을 때 결과값이 골고루 분포되기 위해 grid 형태로 가져오기
        val query = Places.select {
            // geom 이 polygon 안에 있는지 확인
            STWithin(
                geom = Places.geom,
                polygon = STWithin.STGeomFromText(polygonWKT) // WKT 문자열을 geometry 객체로 변환
            ) and Places.deletedAt.isNull()
        }

        val limitedQuery = if (limit != null) {
            query.limit(limit)
        } else {
            query
        }

        limitedQuery.map { row ->
            Place(
                id = row[Places.id],
                name = row[Places.name],
                address = row[Places.address],
                latitude = row[Places.latitude],
                longitude = row[Places.longitude],
                googleMapsId = row[Places.googleMapsId],
                isClosed = row[Places.isClosed],
                closedReason = row[Places.closedReason],
                closedAt = row[Places.closedAt],
                notes = row[Places.notes],
                deletedAt = row[Places.deletedAt]
            )
        }
    }
}

// PostGIS custom functions for Exposed
private class STWithin(
    val geom: Expression<*>,
    val polygon: Expression<*>
) : Op<Boolean>() {
    override fun toQueryBuilder(queryBuilder: QueryBuilder) {
        queryBuilder.append("ST_Within(")
        geom.toQueryBuilder(queryBuilder)
        queryBuilder.append(", ")
        polygon.toQueryBuilder(queryBuilder)
        queryBuilder.append(")")
    }

    class STGeomFromText(
        val wkt: String,
        val srid: Int = 4326 // 4326 for WGS 84
    ) : Expression<String>() {
        override fun toQueryBuilder(queryBuilder: QueryBuilder) {
            queryBuilder.append("ST_GeomFromText('")
            queryBuilder.append(wkt)
            queryBuilder.append("', ")
            queryBuilder.append(srid.toString())
            queryBuilder.append(")")
        }
    }
}
