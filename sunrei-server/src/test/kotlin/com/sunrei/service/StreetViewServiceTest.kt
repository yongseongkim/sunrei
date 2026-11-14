package com.sunrei.service

import com.sunrei.generated.dto.admin.*
import com.sunrei.model.PlaceCategory as ModelCategory
import com.sunrei.di.ServiceLocator
import com.sunrei.routes.admin.adminPlaceRoutes
import com.sunrei.routes.admin.adminSunreiRoutes
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.application.install
import io.ktor.server.routing.*
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.Test
import org.junit.Before
import org.junit.BeforeClass
import org.junit.AfterClass
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import kotlin.test.*

class StreetViewServiceTest {
    private val places = PlaceService("test-secret")
    private val sunreis = SunreiService(places, TagService("test-secret"), "test-secret")
    private val views = StreetViewService()
    companion object {
        private val postgres = PostgreSQLContainer(DockerImageName.parse("postgis/postgis:16-3.4-alpine").asCompatibleSubstituteFor("postgres"))
            .withCreateContainerCmdModifier { it.withPlatform("linux/amd64") }
        @BeforeClass @JvmStatic fun start() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            Database.connect(postgres.jdbcUrl, driver = "org.postgresql.Driver", user = postgres.username, password = postgres.password)
        }
        @AfterClass @JvmStatic fun stop() { postgres.stop() }
    }
    @Before fun seed() { transaction {
        exec("TRUNCATE source, place, tag CASCADE")
        exec("INSERT INTO source(id,type,name) VALUES ('s','YOUTUBE','Channel')")
    } }
    private fun create(published: Boolean = true) = sunreis.create(CreateSunreiRequest("s", published, "Video", spots = listOf(
        CreateSunreiSpotInline(title = "Entrance", context = "At the entrance", sourceLink = "https://example.com/scene", place = PlaceInput("Cafe", "Seoul", 37.56f, 126.98f, googleMapsId = "google-place", category = PlaceCategory.CAFE))
    )))
    private fun input(heading: Double = -10.0) = StreetViewInput("pano-123", heading, 5.0, 1.0, searchAnchor = StreetViewAnchor(37.5601, 126.9801))
    private fun save(id: String, spot: String, input: StreetViewInput? = input()) = views.update(id, spot, UpdateSunreiSpotStreetViewRequest(views.get(id, spot).revision, input))

    @Test fun `save normalizes POV persists JSONB and public endpoints agree`() {
        val sunrei = create(); val spot = sunrei.spots.single()
        val initial = views.get(sunrei.id, spot.id)
        assertNull(initial.streetView); assertFalse(initial.isStale)
        val saved = save(sunrei.id, spot.id)
        assertEquals(350.0, saved.streetView!!.heading)
        assertNotEquals(initial.revision, saved.revision)
        assertNotNull(saved.streetView!!.reviewedAt)
        assertEquals(saved, views.get(sunrei.id, spot.id))
        assertEquals("pano-123", sunreis.getPublishedWithSpots(sunrei.id, null, null)!!.spots.single().streetView!!.panoramaId)
        val byPlace = SunreiSpotService().listPublishedSpotsByPlace(spot.place.id)
        assertEquals("pano-123", byPlace.single().streetView!!.panoramaId)
        transaction { exec("SELECT pg_typeof(street_view)::text FROM sunrei_spot") { rows -> rows.next(); assertEquals("jsonb", rows.getString(1)) } }
    }
    @Test fun `clear advances revision and ordinary Sunrei saves preserve settings`() {
        val sunrei = create(); val spot = sunrei.spots.single(); val saved = save(sunrei.id, spot.id)
        sunreis.update(sunrei.id, UpdateSunreiRequest(title = "Renamed", spots = listOf(UpdateSunreiSpotInline(id = spot.id, title = "Retitled", place = PlaceInput(spot.place.name, spot.place.address, spot.place.latitude, spot.place.longitude, id = spot.place.id)))))
        assertEquals(saved, views.get(sunrei.id, spot.id))
        places.update(spot.place.id, UpdatePlaceRequest(category = PlaceCategory.RESTAURANT))
        assertEquals(saved, views.get(sunrei.id, spot.id))
        val cleared = save(sunrei.id, spot.id, null)
        assertNull(cleared.streetView); assertFalse(cleared.isStale); assertNotEquals(saved.revision, cleared.revision)
    }
    @Test fun `Place and source-link edits hide public settings but retain stale admin settings`() {
        val sunrei = create(); val spot = sunrei.spots.single(); val saved = save(sunrei.id, spot.id)
        places.update(spot.place.id, UpdatePlaceRequest(latitude = 37.57f, longitude = 126.99f, googleMapsId = "updated-google-id"))
        val stale = views.get(sunrei.id, spot.id)
        assertTrue(stale.isStale)
        assertEquals(setOf(StreetViewStaleReason.PLACE_LOCATION_CHANGED, StreetViewStaleReason.GOOGLE_PLACE_ID_CHANGED), stale.staleReasons.toSet())
        assertNotNull(stale.streetView)
        assertNull(sunreis.getPublishedWithSpots(sunrei.id, null, null)!!.spots.single().streetView)
        assertFailsWith<ConflictException> { views.update(sunrei.id, spot.id, UpdateSunreiSpotStreetViewRequest(saved.revision, input())) }
        save(sunrei.id, spot.id)
        sunreis.update(sunrei.id, UpdateSunreiRequest(spots = listOf(UpdateSunreiSpotInline(id = spot.id, title = spot.title, sourceLink = "https://example.com/new-scene"))))
        assertEquals(listOf(StreetViewStaleReason.SOURCE_LINK_CHANGED), views.get(sunrei.id, spot.id).staleReasons)
        assertNull(SunreiSpotService().listPublishedSpotsByPlace(spot.place.id).single().streetView)
        save(sunrei.id, spot.id)
        assertFalse(views.get(sunrei.id, spot.id).isStale)
    }
    @Test fun `invalid inputs do not modify revision`() {
        val sunrei = create(); val spot = sunrei.spots.single(); val before = views.get(sunrei.id, spot.id)
        for (bad in listOf(input().copy(panoramaId = ""), input().copy(panoramaId = "google-place"), input().copy(panoramaId = " google-place "), input().copy(heading = Double.NaN), input().copy(pitch = 91.0), input().copy(zoom = -1.0), input().copy(searchAnchor = StreetViewAnchor(91.0, 0.0)))) {
            assertFailsWith<IllegalArgumentException> { views.update(sunrei.id, spot.id, UpdateSunreiSpotStreetViewRequest(before.revision, bad)) }
        }
        assertEquals(before, views.get(sunrei.id, spot.id))
    }
    @Test fun `wrong parent and soft deleted entities are not editable and drafts stay private`() {
        val draft = create(false); val spot = draft.spots.single()
        save(draft.id, spot.id)
        assertNull(sunreis.getPublishedWithSpots(draft.id, null, null))
        assertTrue(SunreiSpotService().listPublishedSpotsByPlace(spot.place.id).isEmpty())
        val other = create()
        assertFailsWith<NotFoundException> { views.get(other.id, spot.id) }
        assertFailsWith<NotFoundException> { views.get(draft.id, "missing") }
        transaction { exec("UPDATE place SET deleted_at = now() WHERE id = '${spot.place.id}'") }
        assertFailsWith<NotFoundException> { views.get(draft.id, spot.id) }
        assertNull(sunreis.getPublishedWithSpots(other.id, null, null)!!.spots.single().streetView)
        sunreis.delete(draft.id)
        assertFailsWith<NotFoundException> { views.get(draft.id, spot.id) }
    }
    @Test fun `concurrent saves with one revision have one winner`() {
        val sunrei = create(); val spot = sunrei.spots.single(); val revision = views.get(sunrei.id, spot.id).revision
        val barrier = CyclicBarrier(2); val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = (0..1).map { number -> pool.submit(Callable {
                barrier.await()
                try { views.update(sunrei.id, spot.id, UpdateSunreiSpotStreetViewRequest(revision, input(number.toDouble()))); "saved" }
                catch (_: ConflictException) { "conflict" }
            }) }
            assertEquals(listOf("conflict", "saved"), futures.map { it.get() }.sorted())
        } finally { pool.shutdownNow() }
    }
    @Test fun `category defaults partial updates and existing place reuse`() {
        val sunrei = create(); val place = sunrei.spots.single().place
        assertEquals(ModelCategory.CAFE, place.category)
        places.update(place.id, UpdatePlaceRequest(notes = "Preserve category"))
        assertEquals(ModelCategory.CAFE, places.getById(place.id)!!.category)
        val reused = transaction { places.resolvePlace(PlaceInput("Different name", "Address", 1f, 2f, googleMapsId = "google-place", category = PlaceCategory.RESTAURANT)) }
        assertEquals(place.id, reused); assertEquals(ModelCategory.CAFE, places.getById(reused)!!.category)
        assertEquals(ModelCategory.OTHER, places.update(place.id, UpdatePlaceRequest(category = PlaceCategory.OTHER))!!.category)
        val other = transaction { places.resolvePlace(PlaceInput("New", "Address", 1f, 2f)) }
        assertEquals(ModelCategory.OTHER, places.getById(other)!!.category)
    }
    @Test fun `HTTP contract rejects malformed fields preserves partial category and returns revision conflicts`() = testApplication {
        val sunrei = create(); val spot = sunrei.spots.single()
        ServiceLocator.placeService = places
        ServiceLocator.sunreiService = sunreis
        application {
            install(ContentNegotiation) { json() }
            routing { route("/admin") { adminSunreiRoutes(); adminPlaceRoutes() } }
        }
        val path = "/admin/sunreis/${sunrei.id}/spots/${spot.id}/street-view"
        val initial = client.get(path)
        assertEquals(HttpStatusCode.OK, initial.status)
        val revision = Json.parseToJsonElement(initial.bodyAsText()).jsonObject["revision"]!!.jsonPrimitive.content
        for (body in listOf("{}", """{"expectedRevision":"$revision"}""", """{"streetView":null}""", """{"expectedRevision":"$revision","streetView":{"panoramaId":"pano"}}""")) {
            assertEquals(HttpStatusCode.BadRequest, client.patch(path) { contentType(ContentType.Application.Json); setBody(body) }.status)
        }
        assertEquals(HttpStatusCode.BadRequest, client.patch("/admin/places/${spot.place.id}") { contentType(ContentType.Application.Json); setBody("""{"category":null}""") }.status)
        assertEquals(HttpStatusCode.BadRequest, client.patch("/admin/places/${spot.place.id}") { contentType(ContentType.Application.Json); setBody("""{"category":"UNKNOWN"}""") }.status)
        assertEquals(HttpStatusCode.OK, client.patch("/admin/places/${spot.place.id}") { contentType(ContentType.Application.Json); setBody("""{"notes":"Keep category"}""") }.status)
        assertEquals(ModelCategory.CAFE, places.getById(spot.place.id)!!.category)
        val body = """{"expectedRevision":"$revision","streetView":{"panoramaId":"pano-valid","heading":370,"pitch":0,"zoom":1}}"""
        assertEquals(HttpStatusCode.OK, client.patch(path) { contentType(ContentType.Application.Json); setBody(body) }.status)
        assertEquals(HttpStatusCode.Conflict, client.patch(path) { contentType(ContentType.Application.Json); setBody(body) }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/admin/sunreis/wrong/spots/${spot.id}/street-view").status)
    }

}
