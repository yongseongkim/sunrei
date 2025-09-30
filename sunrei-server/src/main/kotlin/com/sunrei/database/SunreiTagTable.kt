package com.sunrei.database

import org.jetbrains.exposed.sql.Table

object SunreiTags : Table("sunrei_tags") {
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id)
    val tagId = varchar("tag_id", 32).references(Tags.id)

    override val primaryKey = PrimaryKey(sunreiId, tagId)
}