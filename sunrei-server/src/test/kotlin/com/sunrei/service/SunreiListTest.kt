package com.sunrei.service

import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.SunreiSort
import com.sunrei.model.SourceType
import kotlinx.datetime.Clock
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SunreiListTest {
    private val service = SunreiService(PlaceService("list-secret"), TagService("list-secret"), "list-secret")

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
        fun stopDatabase() { postgres.stop() }
    }

    @Before
    fun seedContent() {
        transaction {
            exec("TRUNCATE source, place, tag CASCADE")
            exec("INSERT INTO source(id,type,name) VALUES ('yt','YOUTUBE','YouTube'),('ig','INSTAGRAM','Instagram')")
            exec("""
                INSERT INTO sunrei(id,source_id,title,created_at,updated_at,published_at) VALUES
                ('a','yt','Zulu','2020-01-01','2025-01-01','2020-01-01'),
                ('b','yt','Alpha','2021-01-01','2024-01-01',NULL),
                ('c','yt','Alpha','2021-01-01','2023-01-01','2021-01-01'),
                ('d','ig','Cafe','2022-01-01','2022-01-01',NULL)
            """.trimIndent())
            exec("INSERT INTO sunrei(id,source_id,title,created_at,deleted_at) VALUES ('deleted','yt','Hidden','2099-01-01',now())")
        }
    }

    @Test
    fun `default sorting is stable across timestamp ties and pages`() {
        val first = service.list(size = 2)
        assertEquals(listOf("d", "c"), first.data.map { it.id })
        assertEquals(first.data, service.list(size = 2).data)
        val second = service.list(nextToken = assertNotNull(first.nextToken), size = 2)
        assertEquals(listOf("b", "a"), second.data.map { it.id })
        assertEquals(4, first.totalElements)
        assertNull(second.nextToken)
    }

    @Test
    fun `updated and title sorts apply before pagination`() {
        val updated = service.list(size = 2, sort = SunreiSort.UPDATED_DESC)
        assertEquals(listOf("a", "b"), updated.data.map { it.id })
        assertEquals(listOf("c", "d"), service.list(nextToken = updated.nextToken, sort = SunreiSort.UPDATED_DESC).data.map { it.id })
        val title = service.list(size = 2, sort = SunreiSort.TITLE_ASC)
        assertEquals(listOf("c", "b"), title.data.map { it.id })
        assertEquals(listOf("d", "a"), service.list(nextToken = title.nextToken, sort = SunreiSort.TITLE_ASC).data.map { it.id })
    }

    @Test
    fun `source type and publication filters apply to the complete result`() {
        val filtered = service.list(size = 2, sourceType = SourceType.YOUTUBE)
        assertEquals(listOf("c", "b"), filtered.data.map { it.id })
        assertEquals(3, filtered.totalElements)
        assertEquals(listOf("a"), service.list(nextToken = filtered.nextToken, sourceType = SourceType.YOUTUBE).data.map { it.id })
        assertEquals(listOf("c", "a"), service.list(sourceType = SourceType.YOUTUBE, published = true).data.map { it.id })
        assertEquals(listOf("d"), service.list(sourceType = SourceType.INSTAGRAM, published = false).data.map { it.id })
    }

    @Test
    fun `search and source selection retain sorting`() {
        assertEquals(listOf("b", "c"), service.list(q = "Alpha", sort = SunreiSort.UPDATED_DESC).data.map { it.id })
        assertEquals(listOf("c", "b", "a"), service.list(sourceId = "yt").data.map { it.id })
    }

    @Test
    fun `new Sunreis use their actual creation time instead of a process default`() {
        val before = Clock.System.now()
        val first = service.create(CreateSunreiRequest("yt", false, "New first"))
        val second = service.create(CreateSunreiRequest("yt", false, "New second"))
        assertTrue(first.createdAt >= before)
        assertEquals(first.createdAt, first.updatedAt)
        assertTrue(second.createdAt > first.createdAt)
        assertEquals(listOf(second.id, first.id), service.list(size = 2).data.map { it.id })
    }
}
