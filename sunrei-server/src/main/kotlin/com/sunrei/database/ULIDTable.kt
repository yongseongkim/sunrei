package com.sunrei.database

import com.sunrei.utils.IdGenerator
import kotlinx.datetime.Clock
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp
import org.jetbrains.exposed.sql.statements.InsertStatement

abstract class ULIDTable(name: String, private val idPrefix: String) : Table(name) {
    val id = varchar("id", 32)

    override val primaryKey = PrimaryKey(id)

    fun generateId(): String = IdGenerator.generate(idPrefix)

    fun <T : Table> T.autoGenerateId(insert: InsertStatement<Number>) {
        if (insert[id].isNullOrEmpty()) {
            insert[id] = generateId()
        }
    }
}

abstract class ULIDTimestampedTable(name: String, idPrefix: String) : ULIDTable(name, idPrefix) {
    val createdAt = timestamp("created_at").default(Clock.System.now())
    val updatedAt = timestamp("updated_at").default(Clock.System.now())
}

private fun String?.isNullOrEmpty(): Boolean = this == null || this.isEmpty()

fun <T : ULIDTable> T.insertAndGetId(body: T.(InsertStatement<Number>) -> Unit): String {
    val generatedId = generateId()
    insert {
        it[id] = generatedId
        body(it)
    }
    return generatedId
}