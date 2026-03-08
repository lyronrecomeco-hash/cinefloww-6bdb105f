@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.components.CatalogGrid

@Composable
fun MoviesScreen(vm: HomeViewModel, onDetails: (CineVeoItem) -> Unit) {
    val items by vm.movies.collectAsState()
    val isGlobalLoading by vm.isLoading.collectAsState()
    val isMoviesLoading by vm.isMoviesLoading.collectAsState()
    val currentPage by vm.currentMoviePage.collectAsState()
    val totalPages by vm.totalMoviePages.collectAsState()

    LaunchedEffect(Unit) {
        if (items.isEmpty()) vm.loadMoviePage(1)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
            .statusBarsPadding()
    ) {
        if (items.isEmpty() && (isGlobalLoading || isMoviesLoading)) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = LyneAccent, strokeWidth = 2.dp)
            }
        } else {
            CatalogGrid(
                items = items,
                loading = isMoviesLoading && items.isEmpty(),
                currentPage = currentPage,
                totalPages = totalPages,
                onPageChange = { page: Int -> vm.loadMoviePage(page) },
                onDetails = onDetails,
                headerTitle = "Filmes",
                headerSubtitle = if (totalPages > 0) "Página $currentPage de $totalPages" else ""
            )
        }
    }
}
