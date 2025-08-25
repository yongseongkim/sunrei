package com.sunrei.utils

data class Point(
    val latitude: Float,
    val longitude: Float
)

fun parseWKTPolygon(wkt: String): List<Point> {
    val regex = Regex("""POLYGON\s*\(\s*\(\s*([^)]+)\s*\)\s*\)""", RegexOption.IGNORE_CASE)
    val match = regex.find(wkt) ?: throw IllegalArgumentException("Invalid WKT polygon format")
    
    val coordinatesStr = match.groupValues[1]
    return coordinatesStr.split(',').map { coord ->
        val parts = coord.trim().split(Regex("\\s+"))
        val lon = parts[0].toFloat()
        val lat = parts[1].toFloat()
        Point(latitude = lat, longitude = lon)
    }
}

fun isPointInPolygon(point: Point, polygon: List<Point>): Boolean {
    var inside = false
    
    var j = polygon.size - 1
    for (i in polygon.indices) {
        val xi = polygon[i].longitude
        val yi = polygon[i].latitude
        val xj = polygon[j].longitude
        val yj = polygon[j].latitude
        
        val intersect = ((yi > point.latitude) != (yj > point.latitude)) &&
                (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi)
        
        if (intersect) inside = !inside
        j = i
    }
    
    return inside
}