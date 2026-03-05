@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.data.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lyneflix.online.data.AppCatalogApi
import com.lyneflix.online.data.models.CineVeoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val TAG = "HomeViewModel"

    // ── Estado do Início ─────────────────────────────────────────────────────
    private val _featured = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val featured: StateFlow<List<CineVeoItem>> = _featured

    private val _emAlta = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val emAlta: StateFlow<List<CineVeoItem>> = _emAlta

    private val _movies = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val movies: StateFlow<List<CineVeoItem>> = _movies

    private val _series = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val series: StateFlow<List<CineVeoItem>> = _series

    private val _doramas = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val doramas: StateFlow<List<CineVeoItem>> = _doramas

    private val _animes = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val animes: StateFlow<List<CineVeoItem>> = _animes

    private val _recentlyAdded = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val recentlyAdded: StateFlow<List<CineVeoItem>> = _recentlyAdded

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading

    // ── Estado das Abas (paginação) ──────────────────────────────────────────

    // Filmes
    private val _moviesCatalog = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val moviesCatalog: StateFlow<List<CineVeoItem>> = _moviesCatalog

    private val _currentMoviePage = MutableStateFlow(1)
    val currentMoviePage: StateFlow<Int> = _currentMoviePage

    private val _totalMoviePages = MutableStateFlow(1)
    val totalMoviePages: StateFlow<Int> = _totalMoviePages

    // Séries
    private val _seriesCatalog = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val seriesCatalog: StateFlow<List<CineVeoItem>> = _seriesCatalog

    private val _currentSeriesPage = MutableStateFlow(1)
    val currentSeriesPage: StateFlow<Int> = _currentSeriesPage

    private val _totalSeriesPages = MutableStateFlow(1)
    val totalSeriesPages: StateFlow<Int> = _totalSeriesPages

    // Animes
    private val _animesCatalog = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val animesCatalog: StateFlow<List<CineVeoItem>> = _animesCatalog

    private val _currentAnimePage = MutableStateFlow(1)
    val currentAnimePage: StateFlow<Int> = _currentAnimePage

    private val _totalAnimePages = MutableStateFlow(1)
    val totalAnimePages: StateFlow<Int> = _totalAnimePages

    private val _isPageLoading = MutableStateFlow(false)
    val isPageLoading: StateFlow<Boolean> = _isPageLoading

    // ── Carregamento do Início ───────────────────────────────────────────────

    fun loadAll() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val home = AppCatalogApi.getHome()
                if (home != null) {
                    _featured.value = home.heroSlider
                    _emAlta.value = home.findSection("em_alta")
                    _recentlyAdded.value = home.findSection("ultimos_adicionados")
                    _movies.value = home.findSection("filmes_populares")
                    _series.value = home.findSection("series_populares")
                    _doramas.value = home.findSection("doramas")
                    _animes.value = home.findSection("animes")
                    Log.i(TAG, "Home carregada: hero=${home.heroSlider.size}, " +
                            "emAlta=${_emAlta.value.size}, filmes=${_movies.value.size}, " +
                            "series=${_series.value.size}, animes=${_animes.value.size}, " +
                            "doramas=${_doramas.value.size}")
                } else {
                    Log.w(TAG, "Home retornou null")
                }
            } catch (e: Exception) {
                Log.e(TAG, "loadAll error: ${e.message}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    // ── Paginação: Filmes ────────────────────────────────────────────────────

    fun loadMoviePage(page: Int, genreId: Int? = null, year: Int? = null) {
        if (_isPageLoading.value) return
        viewModelScope.launch {
            _isPageLoading.value = true
            try {
                val result = AppCatalogApi.getMovies(page, genreId, year)
                _moviesCatalog.value = result.items
                _currentMoviePage.value = result.page
                _totalMoviePages.value = result.totalPages
                Log.d(TAG, "Movies page $page: ${result.items.size} itens, total=${result.totalPages}")
            } catch (e: Exception) {
                Log.e(TAG, "loadMoviePage error: ${e.message}")
            } finally {
                _isPageLoading.value = false
            }
        }
    }

    // ── Paginação: Séries ────────────────────────────────────────────────────

    fun loadSeriesPage(page: Int, genreId: Int? = null, year: Int? = null) {
        if (_isPageLoading.value) return
        viewModelScope.launch {
            _isPageLoading.value = true
            try {
                val result = AppCatalogApi.getSeries(page, genreId, year)
                _seriesCatalog.value = result.items
                _currentSeriesPage.value = result.page
                _totalSeriesPages.value = result.totalPages
                Log.d(TAG, "Series page $page: ${result.items.size} itens, total=${result.totalPages}")
            } catch (e: Exception) {
                Log.e(TAG, "loadSeriesPage error: ${e.message}")
            } finally {
                _isPageLoading.value = false
            }
        }
    }

    // ── Paginação: Animes ────────────────────────────────────────────────────

    fun loadAnimePage(page: Int) {
        if (_isPageLoading.value) return
        viewModelScope.launch {
            _isPageLoading.value = true
            try {
                val result = AppCatalogApi.getAnimes(page)
                _animesCatalog.value = result.items
                _currentAnimePage.value = result.page
                _totalAnimePages.value = result.totalPages
                Log.d(TAG, "Animes page $page: ${result.items.size} itens, total=${result.totalPages}")
            } catch (e: Exception) {
                Log.e(TAG, "loadAnimePage error: ${e.message}")
            } finally {
                _isPageLoading.value = false
            }
        }
    }
}
