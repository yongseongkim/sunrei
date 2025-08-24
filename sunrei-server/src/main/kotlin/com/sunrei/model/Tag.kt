package com.sunrei.model

object Tags : ULIDTable("tag", "T") {
    val name = varchar("name", 64)
    val description = text("description").nullable()
}

data class TagEntity(
    val id: String,
    val name: String,
    val description: String? = null
)