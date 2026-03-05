@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.data

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.network.SafeHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Cliente unificado para a Edge Function app-catalog.
 * Substitui chamadas diretas à CineVeo API e ao TMDB no app.
 */
object AppCatalogApi {

    private const val TAG = "AppCatalogApi"
    private const val URL = "https://mfcnkltcdvitxczjwoer.supabase.co/functions/v1/app-catalog"
    private val gson = Gson()
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    // ── Modelos de resposta ──────────────────────────────────────────────────

    data class HomeData(
        val heroSlider: List<CineVeoItem>,
        val sections: List<Section>
    ) {
        fun findSection(id: String): List<CineVeoItem> =
            sections.firstOrNull { it.id == id }?.items ?: emptyList()
    }

    data class Section(
        val id: String,
        val title: String,
        val items: List<CineVeoItem>
    )

    data class PageData(
        val items: List<CineVeoItem>,
        val page: Int,
        val totalPages: Int
    )

    data class DetailData(
        val tmdbId: Int,
        val title: String,
        val originalTitle: String,
        val overview: String,
        val posterPath: String?,
        val backdropPath: String?,
        val voteAverage: Double,
        val releaseDate: String,
        val runtime: Int,
        val genres: String,
        val imdbId: String?,
        val tagline: String,
        val type: String,
        val numberOfSeasons: Int,
        val numberOfEpisodes: Int,
        val cineveoEpisodes: List<CineveoEpisode>,
        val cast: List<CastItem>,
        val similar: List<CineVeoItem>,
        val trailers: List<TrailerItem>
    )

    data class CineveoEpisode(
        val season: Int = 0,
        val episode: Int = 0,
        val streamUrl: String = ""
    )

    data class CastItem(
        val name: String = "",
        val character: String = "",
        val profilePath: String? = null
    )

    data class TrailerItem(
        val key: String = "",
        val name: String = "",
        val type: String = ""
    )

    data class SeasonData(
        val tmdbId: Int,
        val seasonNumber: Int,
        val episodes: List<EpisodeData>,
        val totalEpisodes: Int
    )

    data class EpisodeData(
        val episodeNumber: Int = 0,
        val name: String = "",
        val overview: String = "",
        val stillPath: String? = null,
        val voteAverage: Double = 0.0,
        val runtime: Int = 0,
        val airDate: String? = null,
        val streamUrl: String = ""
    )

    // ── HTTP POST genérico ───────────────────────────────────────────────────

    private suspend fun post(action: String, data: Map<String, Any> = emptyMap()): String? =
        withContext(Dispatchers.IO) {
            try {
                val body = gson.toJson(mapOf("action" to action, "data" to data))
                val request = okhttp3.Request.Builder()
                    .url(URL)
                    .post(body.toRequestBody(JSON_TYPE))
                    .addHeader("Content-Type", "application/json")
                    .build()
                val response = SafeHttpClient.instance.newCall(request).execute()
                val responseBody = response.body?.string()
                if (response.isSuccessful && !responseBody.isNullOrBlank()) {
                    responseBody
                } else {
                    Log.w(TAG, "[$action] HTTP ${response.code}")
                    null
                }
            } catch (e: Exception) {
                Log.e(TAG, "[$action] error: ${e.message}")
                null
            }
        }

    // ── Parser de itens TMDB → CineVeoItem ───────────────────────────────────

    private fun parseItems(jsonArray: com.google.gson.JsonArray?): List<CineVeoItem> {
        if (jsonArray == null) return emptyList()
        return jsonArray.mapNotNull { el ->
            try {
                val obj = el.asJsonObject
                val id = obj.get("id")?.asInt ?: obj.get("tmdb_id")?.asInt ?: 0
                val title = obj.get("title")?.asString
                    ?: obj.get("name")?.asString ?: ""
                val posterPath = obj.get("poster_path")?.let {
                    if (it.isJsonNull) null else it.asString
                }
                val backdropPath = obj.get("backdrop_path")?.let {
                    if (it.isJsonNull) null else it.asString
                }
                val voteAverage = obj.get("vote_average")?.asDouble ?: 0.0
                val releaseDate = obj.get("release_date")?.let {
                    if (it.isJsonNull) null else it.asString
                } ?: obj.get("first_air_date")?.let {
                    if (it.isJsonNull) null else it.asString
                }
                val mediaType = obj.get("media_type")?.let {
                    if (it.isJsonNull) null else it.asString
                } ?: ""
                val overview = obj.get("overview")?.let {
                    if (it.isJsonNull) "" else it.asString
                } ?: ""
                val contentType = obj.get("content_type")?.let {
                    if (it.isJsonNull) null else it.asString
                }

                if (posterPath == null) return@mapNotNull null
                if (id == 0) return@mapNotNull null

                CineVeoItem(
                    tmdbId = id,
                    title = title,
                    posterPath = posterPath,
                    backdropPath = backdropPath,
                    voteAverage = voteAverage,
                    releaseDate = releaseDate,
                    type = when {
                        mediaType == "tv" -> "serie"
                        mediaType == "movie" -> "movie"
                        contentType == "dorama" -> "serie"
                        else -> mediaType
                    },
                    contentType = contentType,
                    overview = overview
                )
            } catch (e: Exception) {
                Log.w(TAG, "parseItem error: ${e.message}")
                null
            }
        }
    }

    // ── Endpoints públicos ───────────────────────────────────────────────────

    /** Início: retorna hero slider + todas as seções */
    suspend fun getHome(): HomeData? {
        val raw = post("home") ?: return null
        return try {
            val root = JsonParser.parseString(raw).asJsonObject
            val heroSlider = parseItems(root.getAsJsonArray("hero_slider"))
            val sectionsArray = root.getAsJsonArray("sections")
            val sections = sectionsArray?.map { el ->
                val obj = el.asJsonObject
                Section(
                    id = obj.get("id")?.asString ?: "",
                    title = obj.get("title")?.asString ?: "",
                    items = parseItems(obj.getAsJsonArray("items"))
                )
            } ?: emptyList()
            HomeData(heroSlider, sections)
        } catch (e: Exception) {
            Log.e(TAG, "Parse home error: ${e.message}")
            null
        }
    }

    /** Filmes paginados (via TMDB) */
    suspend fun getMovies(page: Int = 1, genreId: Int? = null, year: Int? = null): PageData {
        val data = mutableMapOf<String, Any>("page" to page)
        if (genreId != null) data["genre_id"] = genreId
        if (year != null) data["year"] = year
        return parsePage(post("movies", data), page)
    }

    /** Séries paginadas (via TMDB) */
    suspend fun getSeries(page: Int = 1, genreId: Int? = null, year: Int? = null): PageData {
        val data = mutableMapOf<String, Any>("page" to page)
        if (genreId != null) data["genre_id"] = genreId
        if (year != null) data["year"] = year
        return parsePage(post("series", data), page)
    }

    /** Animes paginados (TMDB Discover Japão) */
    suspend fun getAnimes(page: Int = 1): PageData {
        return parsePage(post("animes", mapOf("page" to page)), page)
    }

    /** Doramas paginados (CineVeo) */
    suspend fun getDoramas(page: Int = 1): PageData {
        return parsePage(post("doramas", mapOf("page" to page)), page)
    }

    /** Busca multi */
    suspend fun search(query: String): List<CineVeoItem> {
        if (query.length < 2) return emptyList()
        val raw = post("search", mapOf("query" to query)) ?: return emptyList()
        return try {
            val root = JsonParser.parseString(raw).asJsonObject
            parseItems(root.getAsJsonArray("results"))
        } catch (e: Exception) {
            Log.e(TAG, "Search parse error: ${e.message}")
            emptyList()
        }
    }

    /** Detalhe completo (TMDB + CineVeo) */
    suspend fun getDetail(tmdbId: Int, type: String): DetailData? {
        val raw = post("detail", mapOf("tmdb_id" to tmdbId, "type" to type)) ?: return null
        return try {
            val o = JsonParser.parseString(raw).asJsonObject
            DetailData(
                tmdbId = o.get("tmdb_id")?.asInt ?: tmdbId,
                title = o.get("title")?.asString ?: "",
                originalTitle = o.get("original_title")?.asString ?: "",
                overview = o.get("overview")?.asString ?: "",
                posterPath = o.get("poster_path")?.let { if (it.isJsonNull) null else it.asString },
                backdropPath = o.get("backdrop_path")?.let { if (it.isJsonNull) null else it.asString },
                voteAverage = o.get("vote_average")?.asDouble ?: 0.0,
                releaseDate = o.get("release_date")?.asString ?: "",
                runtime = o.get("runtime")?.asInt ?: 0,
                genres = o.get("genres")?.asString ?: "",
                imdbId = o.get("imdb_id")?.let { if (it.isJsonNull) null else it.asString },
                tagline = o.get("tagline")?.asString ?: "",
                type = o.get("type")?.asString ?: "movie",
                numberOfSeasons = o.get("number_of_seasons")?.asInt ?: 0,
                numberOfEpisodes = o.get("number_of_episodes")?.asInt ?: 0,
                cineveoEpisodes = o.getAsJsonArray("cineveo_episodes")?.map { ep ->
                    val e = ep.asJsonObject
                    CineveoEpisode(
                        season = e.get("season")?.asInt ?: 0,
                        episode = e.get("episode")?.asInt ?: 0,
                        streamUrl = e.get("stream_url")?.asString ?: ""
                    )
                } ?: emptyList(),
                cast = o.getAsJsonArray("cast")?.map { c ->
                    val cObj = c.asJsonObject
                    CastItem(
                        name = cObj.get("name")?.asString ?: "",
                        character = cObj.get("character")?.asString ?: "",
                        profilePath = cObj.get("profile_path")?.let { if (it.isJsonNull) null else it.asString }
                    )
                } ?: emptyList(),
                similar = o.getAsJsonArray("similar")?.mapNotNull { s ->
                    try {
                        val sObj = s.asJsonObject
                        CineVeoItem(
                            tmdbId = sObj.get("id")?.asInt ?: 0,
                            title = sObj.get("title")?.asString ?: "",
                            posterPath = sObj.get("poster_path")?.let { if (it.isJsonNull) null else it.asString },
                            voteAverage = sObj.get("vote_average")?.asDouble ?: 0.0,
                            type = sObj.get("media_type")?.asString ?: "movie"
                        )
                    } catch (_: Exception) { null }
                } ?: emptyList(),
                trailers = o.getAsJsonArray("trailers")?.map { t ->
                    val tObj = t.asJsonObject
                    TrailerItem(
                        key = tObj.get("key")?.asString ?: "",
                        name = tObj.get("name")?.asString ?: "",
                        type = tObj.get("type")?.asString ?: ""
                    )
                } ?: emptyList()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Detail parse error: ${e.message}")
            null
        }
    }

    /** Episódios de uma temporada (TMDB + stream URLs CineVeo) */
    suspend fun getSeason(tmdbId: Int, season: Int): SeasonData? {
        val raw = post("season", mapOf("tmdb_id" to tmdbId, "season" to season)) ?: return null
        return try {
            val o = JsonParser.parseString(raw).asJsonObject
            SeasonData(
                tmdbId = o.get("tmdb_id")?.asInt ?: tmdbId,
                seasonNumber = o.get("season_number")?.asInt ?: season,
                totalEpisodes = o.get("total_episodes")?.asInt ?: 0,
                episodes = o.getAsJsonArray("episodes")?.map { ep ->
                    val e = ep.asJsonObject
                    EpisodeData(
                        episodeNumber = e.get("episode_number")?.asInt ?: 0,
                        name = e.get("name")?.asString ?: "",
                        overview = e.get("overview")?.asString ?: "",
                        stillPath = e.get("still_path")?.let { if (it.isJsonNull) null else it.asString },
                        voteAverage = e.get("vote_average")?.asDouble ?: 0.0,
                        runtime = e.get("runtime")?.asInt ?: 0,
                        airDate = e.get("air_date")?.let { if (it.isJsonNull) null else it.asString },
                        streamUrl = e.get("stream_url")?.asString ?: ""
                    )
                } ?: emptyList()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Season parse error: ${e.message}")
            null
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun parsePage(raw: String?, fallbackPage: Int): PageData {
        if (raw == null) return PageData(emptyList(), fallbackPage, 0)
        return try {
            val root = JsonParser.parseString(raw).asJsonObject
            PageData(
                items = parseItems(root.getAsJsonArray("items")),
                page = root.get("page")?.asInt ?: fallbackPage,
                totalPages = root.get("total_pages")?.asInt ?: 1
            )
        } catch (e: Exception) {
            Log.e(TAG, "parsePage error: ${e.message}")
            PageData(emptyList(), fallbackPage, 0)
        }
    }
}
