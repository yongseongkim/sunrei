package com.sunrei.database

import org.jetbrains.exposed.sql.ReferenceOption
import org.jetbrains.exposed.sql.Table

object SunreiSpotTags : Table("sunrei_spot_tags") {
    val sunreiSpotId = varchar("sunrei_spot_id", 32).references(SunreiSpots.id, ReferenceOption.CASCADE)
    val tagId = varchar("tag_id", 32).references(Tags.id, ReferenceOption.CASCADE)

    override val primaryKey = PrimaryKey(sunreiSpotId, tagId)
}
