package com.sunrei.service

import com.sunrei.generated.dto.admin.CreateSunreiRequest
import com.sunrei.generated.dto.admin.CreateSunreiSpotInline
import com.sunrei.generated.dto.admin.PlaceInput
import com.sunrei.generated.dto.admin.UpdateSunreiRequest
import com.sunrei.generated.dto.admin.UpdateSunreiSpotInline
import com.sunrei.generated.dto.admin.UpsertYoutubePlaylistRequest
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

class YoutubeResourceTest {
    private val sunreis = SunreiService(PlaceService("test-secret"), TagService("test-secret"), "test-secret")
    private val youtube = YoutubeService(sunreis, "test-secret")

    companion object {
        private val postgres = PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:16-3.4-alpine").asCompatibleSubstituteFor("postgres")
        ).withCreateContainerCmdModifier { it.withPlatform("linux/amd64") }

        @BeforeClass @JvmStatic
        fun startDatabase() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration").load().migrate()
            Database.connect(postgres.jdbcUrl, driver = "org.postgresql.Driver", user = postgres.username, password = postgres.password)
        }

        @AfterClass @JvmStatic
        fun stopDatabase() { postgres.stop() }
    }

    @Before
    fun resetContent() {
        transaction {
            exec("TRUNCATE source, place, tag CASCADE")
            exec("INSERT INTO source(id,type,name,external_url) VALUES ('channel','YOUTUBE','Current channel','https://www.youtube.com/@current')")
            exec("INSERT INTO source(id,type,name,external_url) VALUES ('unrelated','YOUTUBE','Other','https://www.youtube.com/channel/UC-other')")
        }
    }

    private fun spot(title: String, link: String = "https://www.youtube.com/watch?v=$title&t=50") = CreateSunreiSpotInline(
        title = title, context = "Context for $title", sourceLink = link,
        place = PlaceInput(title, "Seoul", 37.56f, 126.98f, googleMapsId = "place-$title")
    )

    @Test
    fun `playlist resolves handle source and returns all live content including drafts in stored order`() {
        val first = sunreis.create(CreateSunreiRequest("channel", false, "Playlist", spots = listOf(spot("first"), spot("second"))))
        youtube.upsertPlaylist("playlist", UpsertYoutubePlaylistRequest("Playlist", channelId = "UC-current", sunreiId = first.id))
        val instagram = sunreis.create(CreateSunreiRequest("channel", false, "Instagram", spots = listOf(spot("instagram", "https://www.instagram.com/p/post/?v=not-a-video"))))
        val published = sunreis.create(CreateSunreiRequest("channel", true, "Published", spots = listOf(spot("short", "https://youtu.be/short-video?t=5"))))
        sunreis.create(CreateSunreiRequest("unrelated", false, "Unrelated", spots = listOf(spot("other"))))
        sunreis.update(first.id, UpdateSunreiRequest(spots = first.spots.reversed().map { UpdateSunreiSpotInline(it.title, id = it.id) }))

        val resource = assertNotNull(youtube.getChannelResource("UC-current"))
        assertEquals("Current channel", resource.channelName)
        assertEquals("https://www.youtube.com/@current", resource.link)
        assertEquals(setOf(first.id, instagram.id, published.id), resource.sunreis.map { it.sunreiId }.toSet())
        val savedFirst = resource.sunreis.single { it.sunreiId == first.id }
        assertEquals(first.createdAt, savedFirst.createdAt)
        assertEquals(first.spots.reversed().map { it.id }, savedFirst.spots.map { it.spotId })
        assertEquals(listOf("second", "first"), savedFirst.spots.map { it.videoId })
        assertNull(resource.sunreis.single { it.sunreiId == instagram.id }.spots.single().videoId)
        assertEquals("short-video", resource.sunreis.single { it.sunreiId == published.id }.spots.single().videoId)
    }

    @Test
    fun `canonical source works without registered playlist and fresh DB edits need no refresh`() {
        val first = sunreis.create(CreateSunreiRequest("unrelated", false, "Direct", spots = listOf(spot("old"), spot("kept"))))
        val archived = sunreis.create(CreateSunreiRequest("unrelated", false, "Archived", spots = listOf(spot("archived"))))
        sunreis.delete(archived.id)
        sunreis.update(first.id, UpdateSunreiRequest(spots = listOf(UpdateSunreiSpotInline("Renamed episode", id = first.spots[1].id))))
        val resource = assertNotNull(youtube.getChannelResource("UC-other"))
        assertEquals(listOf(first.id), resource.sunreis.map { it.sunreiId })
        assertEquals(listOf(first.spots[1].id), resource.sunreis.single().spots.map { it.spotId })
        assertEquals("Renamed episode", resource.sunreis.single().spots.single().videoTitle)
        transaction { exec("UPDATE source SET deleted_at=CURRENT_TIMESTAMP WHERE id='unrelated'") }
        assertNull(youtube.getChannelResource("UC-other"))
    }

    @Test
    fun `known playlist without target returns empty resources while unknown channel returns not found`() {
        youtube.upsertPlaylist("unlinked", UpsertYoutubePlaylistRequest("Playlist", channelId = "UC-empty", channelTitle = "Empty channel"))
        val resource = assertNotNull(youtube.getChannelResource("UC-empty"))
        assertEquals("Empty channel", resource.channelName)
        assertEquals("https://www.youtube.com/channel/UC-empty", resource.link)
        assertEquals(emptyList(), resource.sunreis)
        assertNull(youtube.getChannelResource("UC-missing"))
    }
}
