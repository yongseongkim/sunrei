package com.sunrei.routes.admin

import com.sunrei.di.injectInstagramService
import com.sunrei.generated.dto.admin.CreateInstagramExtractionRunRequest
import com.sunrei.generated.dto.admin.CreateInstagramPostTextRequest
import com.sunrei.generated.dto.admin.InstagramGeocodeStatus
import com.sunrei.generated.dto.admin.InstagramMediaType
import com.sunrei.generated.dto.admin.InstagramPostStatus
import com.sunrei.generated.dto.admin.InstagramReviewStatus
import com.sunrei.generated.dto.admin.ReviewInstagramExtractedPlaceRequest
import com.sunrei.generated.dto.admin.SetInstagramLocationTagRequest
import com.sunrei.generated.dto.admin.SetInstagramPostImagesRequest
import com.sunrei.generated.dto.admin.UpdateInstagramPostRequest
import com.sunrei.generated.dto.admin.UpsertInstagramAccountRequest
import com.sunrei.generated.dto.admin.UpsertInstagramPostsRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.adminInstagramRoutes() {
    route("/instagram") {
        route("/accounts") {
            get {
                call.respond(call.injectInstagramService().listAccounts())
            }

            get("/{id}") {
                val id = call.parameters["id"]!!
                val account = call.injectInstagramService().getAccount(id)
                if (account != null) call.respond(account)
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Account not found"))
            }

            put("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<UpsertInstagramAccountRequest>()
                    call.respond(call.injectInstagramService().upsertAccount(id, request))
                }
            }

            put("/{id}/posts") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<UpsertInstagramPostsRequest>()
                    call.respond(call.injectInstagramService().upsertPosts(id, request))
                }
            }
        }

        route("/posts") {
            get {
                val params = call.request.queryParameters
                call.handleErrors {
                    val result = call.injectInstagramService().listPosts(
                        accountId = params["accountId"],
                        status = params["status"]?.let { InstagramPostStatus.valueOf(it) },
                        mediaType = params["mediaType"]?.let { InstagramMediaType.valueOf(it) },
                        locationTagRead = params["locationTagRead"]?.toBooleanStrict(),
                        nextToken = params["nextToken"],
                        size = params["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20
                    )
                    call.respond(result)
                }
            }

            get("/{id}") {
                val id = call.parameters["id"]!!
                val detail = call.injectInstagramService().getPostDetail(id)
                if (detail != null) call.respond(detail)
                else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Post not found"))
            }

            patch("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<UpdateInstagramPostRequest>()
                    val updated = call.injectInstagramService().updatePost(id, request)
                    if (updated != null) call.respond(updated)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Post not found"))
                }
            }

            put("/{id}/location-tag") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<SetInstagramLocationTagRequest>()
                    val updated = call.injectInstagramService().setLocationTag(id, request)
                    if (updated != null) call.respond(updated)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Post not found"))
                }
            }

            put("/{id}/images") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<SetInstagramPostImagesRequest>()
                    val updated = call.injectInstagramService().setImages(id, request)
                    if (updated != null) call.respond(updated)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Post not found"))
                }
            }

            post("/{id}/texts") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<CreateInstagramPostTextRequest>()
                    call.respond(HttpStatusCode.Created, call.injectInstagramService().createText(id, request))
                }
            }

            post("/{id}/extraction-runs") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<CreateInstagramExtractionRunRequest>()
                    call.respond(HttpStatusCode.Created, call.injectInstagramService().createRun(id, request))
                }
            }
        }

        get("/texts/{id}") {
            val id = call.parameters["id"]!!
            val text = call.injectInstagramService().getText(id)
            if (text != null) call.respond(text)
            else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Text not found"))
        }

        route("/extracted-places") {
            get {
                val params = call.request.queryParameters
                call.handleErrors {
                    val result = call.injectInstagramService().listPlaces(
                        reviewStatus = params["reviewStatus"]?.let { InstagramReviewStatus.valueOf(it) },
                        geocodeStatus = params["geocodeStatus"]?.let { InstagramGeocodeStatus.valueOf(it) },
                        accountId = params["accountId"],
                        postId = params["postId"],
                        nextToken = params["nextToken"],
                        size = params["size"]?.toIntOrNull()?.coerceIn(1, 100) ?: 20
                    )
                    call.respond(result)
                }
            }

            patch("/{id}") {
                val id = call.parameters["id"]!!
                call.handleErrors {
                    val request = call.receive<ReviewInstagramExtractedPlaceRequest>()
                    val reviewed = call.injectInstagramService().reviewPlace(id, request)
                    if (reviewed != null) call.respond(reviewed)
                    else call.respond(HttpStatusCode.NotFound, mapOf("error" to "Extracted place not found"))
                }
            }
        }
    }
}
