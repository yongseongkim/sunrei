package com.sunrei.database

import com.sunrei.utils.IdGenerator
import kotlinx.datetime.Clock
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.timestamp
import org.jetbrains.exposed.sql.statements.InsertStatement

/**
 * Table class that provides automatic ULID generation for primary keys
 * @param name The table name
 * @param idPrefix The prefix for generated ULIDs (e.g., "SR", "SS", "P", "T")
 */
abstract class ULIDTable(name: String, private val idPrefix: String) : Table(name) {
    val id = varchar("id", 32)

    override val primaryKey = PrimaryKey(id)

    /**
     * Generates a new ULID for this table
     */
    fun generateId(): String = IdGenerator.generate(idPrefix)

    /**
     * Automatically generates and sets ID before insert if not already set
     */
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

/**
 * Extension function to check if a string is null or empty
 */
private fun String?.isNullOrEmpty(): Boolean = this == null || this.isEmpty()

/**
 * Extension function to insert a record and return the generated ID
 */
fun <T : ULIDTable> T.insertAndGetId(body: T.(InsertStatement<Number>) -> Unit): String {
    val generatedId = generateId()
    insert {
        it[id] = generatedId
        body(it)
    }
    return generatedId
}