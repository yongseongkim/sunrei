package com.sunrei.service

import com.sunrei.generated.dto.app.TagDTO
import com.sunrei.model.Tags
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction

class TagService {
    
    fun findAll(): List<TagDTO> = transaction {
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