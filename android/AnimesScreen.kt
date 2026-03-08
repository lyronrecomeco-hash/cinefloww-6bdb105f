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
fun AnimesScreen(vm: HomeViewModel, onDetails: (CineVeoItem) -> Unit) {
    val items by vm.animesCatalog.collectAsState()
    val isGlobalLoading by vm.isLoading.collectAsState()
    val isAnimesLoading by vm.isAnimesLoading.collectAsState()
    val currentPage by vm.currentAnimePage.collectAsState()
    val totalPages by vm.totalAnimePages.collectAsState()

    LaunchedEffect(Unit) {
        if (items.isEmpty()) vm.loadAnimePage(1)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
            .statusBarsPadding()
    ) {
        if (items.isEmpty() && (isGlobalLoading || isAnimesLoading)) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = LyneAccent, strokeWidth = 2.dp)
            }
        } else {
            CatalogGrid(
                items = items,
                loading = isAnimesLoading && items.isEmpty(),
                currentPage = currentPage,
                totalPages = totalPages,
                onPageChange = { page: Int -> vm.loadAnimePage(page) },
                onDetails = onDetails,
                headerTitle = "Animes",
                headerSubtitle = if (totalPages > 0) "Página $currentPage de $totalPages" else ""
            )
        }
    }
}
