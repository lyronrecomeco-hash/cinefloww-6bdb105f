@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.data.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lyneflix.online.data.CineVeoApi
import com.lyneflix.online.data.models.CineVeoItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val _movies = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val movies: StateFlow<List<CineVeoItem>> = _movies.asStateFlow()

    private val _series = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val series: StateFlow<List<CineVeoItem>> = _series.asStateFlow()

    private val _animes = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val animes: StateFlow<List<CineVeoItem>> = _animes.asStateFlow()

    private val _featured = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val featured: StateFlow<List<CineVeoItem>> = _featured.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _currentMoviePage = MutableStateFlow(1)
    val currentMoviePage: StateFlow<Int> = _currentMoviePage.asStateFlow()

    private val _currentSeriesPage = MutableStateFlow(1)
    val currentSeriesPage: StateFlow<Int> = _currentSeriesPage.asStateFlow()

    private val _currentAnimePage = MutableStateFlow(1)
    val currentAnimePage: StateFlow<Int> = _currentAnimePage.asStateFlow()

    private val _totalMoviePages = MutableStateFlow(1)
    val totalMoviePages: StateFlow<Int> = _totalMoviePages.asStateFlow()

    private val _totalSeriesPages = MutableStateFlow(1)
    val totalSeriesPages: StateFlow<Int> = _totalSeriesPages.asStateFlow()

    private val _totalAnimePages = MutableStateFlow(1)
    val totalAnimePages: StateFlow<Int> = _totalAnimePages.asStateFlow()

    private val _animesCatalog = MutableStateFlow<List<CineVeoItem>>(emptyList())
    val animesCatalog: StateFlow<List<CineVeoItem>> = _animesCatalog.asStateFlow()

    private val _isMoviesLoading = MutableStateFlow(false)
    val isMoviesLoading: StateFlow<Boolean> = _isMoviesLoading.asStateFlow()

    private val _isSeriesLoading = MutableStateFlow(false)
    val isSeriesLoading: StateFlow<Boolean> = _isSeriesLoading.asStateFlow()

    private val _isAnimesLoading = MutableStateFlow(false)
    val isAnimesLoading: StateFlow<Boolean> = _isAnimesLoading.asStateFlow()

    private var allAnimesList: List<CineVeoItem> = emptyList()
    private val animesPageSize = 30

    @Volatile
    private var loadAllInProgress = false

    init {
        loadAll()
    }

    fun loadAll() {
        if (loadAllInProgress) {
            Log.d("HomeVM", "loadAll ignorado: já em execução")
            return
        }

        loadAllInProgress = true
        _isLoading.value = true

        viewModelScope.launch(Dispatchers.IO) {
            try {
                val moviesDeferred = async {
                    runCatching { CineVeoApi.getMoviesPage(1) }
                        .getOrElse { CineVeoApi.PageResult(emptyList(), 1, 1) }
                }

                val seriesDeferred = async {
                    runCatching { CineVeoApi.getSeriesPage(1) }
                        .getOrElse { CineVeoApi.PageResult(emptyList(), 1, 1) }
                }

                val animesDeferred = async {
                    runCatching { CineVeoApi.getAnimesPage(1) }
                        .getOrElse { CineVeoApi.PageResult(emptyList(), 1, 1) }
                }

                val moviesPageResult = moviesDeferred.await()
                val seriesPageResult = seriesDeferred.await()
                val animesPageResult = animesDeferred.await()

                _movies.value = moviesPageResult.items
                _currentMoviePage.value = moviesPageResult.currentPage
                _totalMoviePages.value = moviesPageResult.totalPages

                _series.value = seriesPageResult.items
                _currentSeriesPage.value = seriesPageResult.currentPage
                _totalSeriesPages.value = seriesPageResult.totalPages

                _animes.value = animesPageResult.items
                _currentAnimePage.value = animesPageResult.currentPage
                _totalAnimePages.value = animesPageResult.totalPages
                _animesCatalog.value = animesPageResult.items

                _featured.value = moviesPageResult.items.take(6)
            } catch (e: Exception) {
                Log.e("HomeVM", "Erro geral: ${e.message}", e)
            } finally {
                _isLoading.value = false
                loadAllInProgress = false
            }
        }
    }

    fun loadMoviePage(page: Int) {
        if (page < 1) return

        viewModelScope.launch(Dispatchers.IO) {
            _isMoviesLoading.value = true
            try {
                val result = CineVeoApi.getMoviesPage(page)
                _movies.value = result.items
                _currentMoviePage.value = result.currentPage
                _totalMoviePages.value = result.totalPages
            } catch (e: Exception) {
                Log.e("HomeVM", "Erro loadMoviePage: ${e.message}", e)
            } finally {
                _isMoviesLoading.value = false
            }
        }
    }

    fun loadSeriesPage(page: Int) {
        if (page < 1) return

        viewModelScope.launch(Dispatchers.IO) {
            _isSeriesLoading.value = true
            try {
                val result = CineVeoApi.getSeriesPage(page)
                _series.value = result.items
                _currentSeriesPage.value = result.currentPage
                _totalSeriesPages.value = result.totalPages
            } catch (e: Exception) {
                Log.e("HomeVM", "Erro loadSeriesPage: ${e.message}", e)
            } finally {
                _isSeriesLoading.value = false
            }
        }
    }

    fun loadAnimePage(page: Int) {
        if (page < 1) return

        viewModelScope.launch(Dispatchers.IO) {
            _isAnimesLoading.value = true
            try {
                if (allAnimesList.isEmpty()) {
                    allAnimesList = CineVeoApi.getAllAnimes()
                }

                if (_animes.value.isEmpty() && allAnimesList.isNotEmpty()) {
                    _animes.value = allAnimesList.take(animesPageSize)
                    _currentAnimePage.value = 1
                    _totalAnimePages.value =
                        (allAnimesList.size + animesPageSize - 1) / animesPageSize
                }

                val totalPages =
                    if (allAnimesList.isEmpty()) 1
                    else (allAnimesList.size + animesPageSize - 1) / animesPageSize

                _totalAnimePages.value = totalPages

                val start = (page - 1) * animesPageSize
                if (start >= allAnimesList.size) {
                    _animesCatalog.value = emptyList()
                    _currentAnimePage.value = page
                    return@launch
                }

                val end = (start + animesPageSize).coerceAtMost(allAnimesList.size)
                _animesCatalog.value = allAnimesList.subList(start, end)
                _currentAnimePage.value = page
            } catch (e: Exception) {
                Log.e("HomeVM", "Erro loadAnimePage: ${e.message}", e)
            } finally {
                _isAnimesLoading.value = false
            }
        }
    }

    fun refreshAll() {
        CineVeoApi.clearCache()
        allAnimesList = emptyList()
        loadAll()
    }
}
