package com.sunrei.utils

import com.github.f4b6a3.ulid.UlidCreator

object IdGenerator {
    // id 컬럼이 VARCHAR(32)이고 ULID가 26자이므로 prefix는 6자 이하여야 한다.
    fun generate(prefix: String): String {
        val ulid = UlidCreator.getUlid()
        return "${prefix}${ulid.toString().lowercase()}"
    }
}