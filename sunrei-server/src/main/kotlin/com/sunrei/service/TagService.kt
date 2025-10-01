package com.sunrei.service

import com.sunrei.database.Tags
import com.sunrei.generated.dto.app.TagDTO
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction

class TagService {

    fun list(): List<TagDTO> = transaction {
        Tags.selectAll()
            .map { row ->
                TagDTO(
                    id = row[Tags.id],
                    name = row[Tags.name],
                    description = row[Tags.description]
                )
            }
    }
}