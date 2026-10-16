package com.sunrei.routes.admin

import com.sunrei.di.injectYoutubeService
import com.sunrei.generated.dto.admin.CreateYoutubeExtractionRunRequest
import com.sunrei.generated.dto.admin.CreateYoutubeVideoTextRequest
import com.sunrei.generated.dto.admin.ReviewYoutubeExtractedPlaceRequest
import com.sunrei.generated.dto.admin.SyncYoutubePlaylistVideosRequest
import com.sunrei.generated.dto.admin.UpdateYoutubeVideoRequest
import com.sunrei.generated.dto.admin.UpsertYoutubePlaylistRequest
import com.sunrei.generated.dto.admin.YoutubeReviewStatus
import com.sunrei.generated.dto.admin.YoutubeVideoStatus
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.adminYoutubeRoutes() {
    route("/youtube") {
        route("/playlists") {
            get {
                call.respond(call.injectYoutubeService().listPlaylists())
            }

            get("/{id}") {
                val id = call.parameters["id"]!!
                val playlist = call.injectYoutubeService().getPlaylist(id)
                if (playlist != null) call.respond(playlist)
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Playlist not found"))
            }

            put("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<UpsertYoutubePlaylistRequest>()
                    call.respond(call.injectYoutubeService().upsertPlaylist(id, request))
                }
            }

            put("/{id}/videos") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<SyncYoutubePlaylistVideosRequest>()
                    call.respond(call.injectYoutubeService().syncPlaylistVideos(id, request))
                }
            }
        }

        route("/videos") {
            get {
                val params = call.request.queryParameters
                call.handleErrors {
                    val result = call.injectYoutubeService().listVideos(
                        playlistId = params["playlistId"],
                        status = params["status"]?.let { YoutubeVideoStatus.valueOf(it) },
                        nextToken = params["nextToken"],
                        size = params["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20
                    )
                    call.respond(result)
                }
            }

            get("/{id}") {
                val id = call.parameters["id"]!!
                val detail = call.injectYoutubeService().getVideoDetail(id)
                if (detail != null) call.respond(detail)
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Video not found"))
            }

            patch("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<UpdateYoutubeVideoRequest>()
                    val updated = call.injectYoutubeService().updateVideo(id, request)
                    if (updated != null) call.respond(updated)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Video not found"))
                }
            }

            post("/{id}/texts") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<CreateYoutubeVideoTextRequest>()
                    call.respond(HttpStatusCode.Created, call.injectYoutubeService().createText(id, request))
                }
            }

            post("/{id}/extraction-runs") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<CreateYoutubeExtractionRunRequest>()
                    call.respond(HttpStatusCode.Created, call.injectYoutubeService().createRun(id, request))
                }
            }
        }

        get("/texts/{id}") {
            val id = call.parameters["id"]!!
            val text = call.injectYoutubeService().getText(id)
            if (text != null) call.respond(text)
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Text not found"))
        }

        route("/extracted-places") {
            get {
                val params = call.request.queryParameters
                call.handleErrors {
                    val result = call.injectYoutubeService().listPlaces(
                        reviewStatus = params["reviewStatus"]?.let { YoutubeReviewStatus.valueOf(it) },
                        playlistId = params["playlistId"],
                        videoId = params["videoId"],
                        nextToken = params["nextToken"],
                        size = params["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20
                    )
                    call.respond(result)
                }
            }

            patch("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<ReviewYoutubeExtractedPlaceRequest>()
                    val reviewed = call.injectYoutubeService().reviewPlace(id, request)
                    if (reviewed != null) call.respond(reviewed)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Extracted place not found"))
                }
            }
        }
    }
}
