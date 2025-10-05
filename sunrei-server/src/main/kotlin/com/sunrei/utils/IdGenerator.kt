package com.sunrei.utils

import com.github.f4b6a3.ulid.UlidCreator

object IdGenerator {
    fun generate(prefix: String): String {
        val ulid = UlidCreator.getUlid()
        return "${prefix}${ulid.toString().lowercase()}"
    }
}