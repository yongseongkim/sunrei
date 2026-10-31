package com.sunrei.service

import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiSpotInline
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.sql.DriverManager
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SunreiSpotOrderTest {
    private val service = SunreiService(PlaceService("test-secret"), TagService("test-secret"), "test-secret")

    companion object {
        private val postgres = PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:16-3.4-alpine").asCompatibleSubstituteFor("postgres")
        ).withCreateContainerCmdModifier { it.withPlatform("linux/amd64") }

        @BeforeClass
        @JvmStatic
        fun startDatabase() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration").load().migrate()
            Database.connect(postgres.jdbcUrl, driver = "org.postgresql.Driver", user = postgres.username, password = postgres.password)
        }

        @AfterClass
        @JvmStatic
        fun stopDatabase() {
            postgres.stop()
        }
    }

    @Before
    fun clearContent() {
        transaction {
            exec("TRUNCATE source, place, tag CASCADE")
            exec("INSERT INTO source(id,type,name) VALUES ('order-source','YOUTUBE','Order test')")
        }
    }

    private fun spot(name: String, latitude: Double = 37.56) = CreateSunreiSpotInline(
        title = name,
        context = "Context for $name",
        sourceLink = "https://example.com/$name",
        place = PlaceInput(name, "Seoul", latitude.toFloat(), 126.98f, googleMapsId = "test-$name")
    )

    @Test
    fun `reordering and saving preserves spot IDs and content`() {
        val created = service.create(CreateSunreiRequest("order-source", false, "Ordered", spots = listOf(spot("first"), spot("second"))))
        val wanted = created.spots.reversed()
        service.update(created.id, UpdateSunreiRequest(spots = wanted.map { UpdateSunreiSpotInline(title = it.title, id = it.id) }))
        assertEquals(wanted, assertNotNull(service.getById(created.id)).spots)
        service.update(created.id, UpdateSunreiRequest(summary = "Top-level edit"))
        assertEquals(wanted, assertNotNull(service.getById(created.id)).spots)
    }

    @Test
    fun `new spots from both form saves and collection append in order`() {
        val created = service.create(CreateSunreiRequest("order-source", false, "Ordered", spots = listOf(spot("first"), spot("second"))))
        service.update(created.id, UpdateSunreiRequest(spots = listOf(
            UpdateSunreiSpotInline(title = "second", id = created.spots[1].id),
            UpdateSunreiSpotInline(title = "third", place = spot("third").place),
            UpdateSunreiSpotInline(title = "first", id = created.spots[0].id)
        )))
        service.addSpot(created.id, spot("fourth"))
        assertEquals(listOf("second", "third", "first", "fourth"), assertNotNull(service.getById(created.id)).spots.map { it.title })
    }

    @Test
    fun `distance takes priority over stored display order`() {
        val created = service.create(CreateSunreiRequest("order-source", true, "Distances", spots = listOf(
            spot("far", latitude = 37.66), spot("near", latitude = 37.56)
        )))
        assertEquals(listOf("far", "near"), assertNotNull(service.getById(created.id)).spots.map { it.title })
        assertEquals(listOf("near", "far"), assertNotNull(service.getPublishedWithSpots(created.id, 37.56, 126.98)).spots.map { it.title })
    }

    @Test
    fun `migration backfills existing rows by creation time and ID`() {
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE spot_order_migration_test") }
        }
        val url = postgres.jdbcUrl.substringBeforeLast('/') + "/spot_order_migration_test"
        Flyway.configure().dataSource(url, postgres.username, postgres.password)
            .locations("classpath:db/migration").target("5").load().migrate()
        DriverManager.getConnection(url, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("INSERT INTO source(id,type,name) VALUES ('s','YOUTUBE','Migration')")
                statement.execute("INSERT INTO sunrei(id,source_id,title) VALUES ('sr','s','Migration')")
                statement.execute("INSERT INTO place(id,name,address,latitude,longitude) VALUES ('p','Place','Seoul',37.56,126.98)")
                statement.execute("""
                    INSERT INTO sunrei_spot(id,title,place_id,sunrei_id,created_at) VALUES
                    ('c','C','p','sr','2021-01-01T00:00:00Z'),
                    ('a','A','p','sr','2021-01-01T00:00:00Z'),
                    ('b','B','p','sr','2020-01-01T00:00:00Z')
                """.trimIndent())
            }
        }
        Flyway.configure().dataSource(url, postgres.username, postgres.password)
            .locations("classpath:db/migration").load().migrate()
        DriverManager.getConnection(url, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT id, sort_order FROM sunrei_spot ORDER BY sort_order,id").use { rows ->
                    val ordered = mutableListOf<Pair<String, Int>>()
                    while (rows.next()) ordered.add(rows.getString(1) to rows.getInt(2))
                    assertEquals(listOf("b" to 0, "a" to 1, "c" to 2), ordered)
                }
            }
        }
    }
}
