package com.sunrei.database

object Tags : ULIDTable("tag", "T") {
    val labelEn = varchar("label_en", 64)
    val labelKo = varchar("label_ko", 64)
    val description = text("description").nullable()
}
