package com.sunrei.database

object Tags : ULIDTable("tag", "T") {
    val name = varchar("name", 64)
    val description = text("description").nullable()
}