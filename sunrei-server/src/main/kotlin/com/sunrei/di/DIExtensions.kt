package com.sunrei.di

import com.sunrei.auth.service.IAuthService
import com.sunrei.service.PlaceService
import com.sunrei.service.S3Config
import com.sunrei.service.S3Service
import com.sunrei.service.SearchService
import com.sunrei.service.SourceService
import com.sunrei.service.SunreiService
import com.sunrei.service.SunreiSpotService
import com.sunrei.service.TagService
import com.sunrei.service.UserService
import io.ktor.client.HttpClient
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall

// Helper extension functions to get dependencies from ServiceLocator

fun ApplicationCall.injectUserService(): UserService = ServiceLocator.userService
fun ApplicationCall.injectPlaceService(): PlaceService = ServiceLocator.placeService
fun ApplicationCall.injectTagService(): TagService = ServiceLocator.tagService
fun ApplicationCall.injectSourceService(): SourceService = ServiceLocator.sourceService
fun ApplicationCall.injectSunreiService(): SunreiService = ServiceLocator.sunreiService
fun ApplicationCall.injectSunreiSpotService(): SunreiSpotService = ServiceLocator.sunreiSpotService
fun ApplicationCall.injectSearchService(): SearchService = ServiceLocator.searchService
fun ApplicationCall.injectAuthService(): IAuthService = ServiceLocator.authService
fun ApplicationCall.injectS3Service(): S3Service = ServiceLocator.s3Service
fun ApplicationCall.injectS3Config(): S3Config = ServiceLocator.s3Config
fun ApplicationCall.injectHttpClient(): HttpClient = ServiceLocator.httpClient.value

// Application-level inject functions
fun Application.injectUserService(): UserService = ServiceLocator.userService
fun Application.injectPlaceService(): PlaceService = ServiceLocator.placeService
fun Application.injectTagService(): TagService = ServiceLocator.tagService
fun Application.injectSourceService(): SourceService = ServiceLocator.sourceService
fun Application.injectSunreiService(): SunreiService = ServiceLocator.sunreiService
fun Application.injectSunreiSpotService(): SunreiSpotService = ServiceLocator.sunreiSpotService
fun Application.injectSearchService(): SearchService = ServiceLocator.searchService
fun Application.injectAuthService(): IAuthService = ServiceLocator.authService
fun Application.injectS3Service(): S3Service = ServiceLocator.s3Service
