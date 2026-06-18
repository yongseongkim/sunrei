package com.sunrei.config

import com.sunrei.database.OAuthProviderTable
import com.sunrei.database.Places
import com.sunrei.database.Sources
import com.sunrei.database.SunreiSpots
import com.sunrei.database.SunreiSpotTags
import com.sunrei.database.Sunreis
import com.sunrei.database.Tags
import com.sunrei.database.UserTable
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.config.ApplicationConfig
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseConfig {
    private lateinit var appConfig: ApplicationConfig

    fun init(config: ApplicationConfig) {
        appConfig = config
        val dataSource = hikari()
        Database.connect(dataSource)

        // Only create tables in development mode
        val seedData = config.propertyOrNull("features.seedData")?.getString()?.toBoolean() ?: false
        if (seedData) {
            transaction {
                SchemaUtils.create(
                    Places,
                    Sources,
                    Sunreis,
                    SunreiSpots,
                    Tags,
                    SunreiSpotTags,
                    UserTable,
                    OAuthProviderTable
                )
            }
        }
    }

    private fun hikari(): HikariDataSource {
        val config = HikariConfig()
        config.driverClassName = "org.postgresql.Driver"

        val host = appConfig.property("database.host").getString()
        val port = appConfig.property("database.port").getString()
        val name = appConfig.property("database.name").getString()
        val user = appConfig.property("database.user").getString()
        val password = appConfig.property("database.password").getString()

        config.jdbcUrl = "jdbc:postgresql://$host:$port/$name"
        config.username = user
        config.password = password
        config.maximumPoolSize = appConfig.property("database.poolSize").getString().toInt()
        config.connectionTimeout = appConfig.property("database.connectionTimeout").getString().toLong()
        config.isAutoCommit = false
        config.transactionIsolation = "TRANSACTION_REPEATABLE_READ"
        config.validate()
        return HikariDataSource(config)
    }
}
