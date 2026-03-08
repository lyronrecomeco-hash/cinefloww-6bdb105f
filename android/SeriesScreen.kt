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
fun SeriesScreen(vm: HomeViewModel, onDetails: (CineVeoItem) -> Unit) {
    val items by vm.series.collectAsState()
    val isGlobalLoading by vm.isLoading.collectAsState()
    val isSeriesLoading by vm.isSeriesLoading.collectAsState()
    val currentPage by vm.currentSeriesPage.collectAsState()
    val totalPages by vm.totalSeriesPages.collectAsState()

    LaunchedEffect(Unit) {
        if (items.isEmpty()) vm.loadSeriesPage(1)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
            .statusBarsPadding()
    ) {
        if (items.isEmpty() && (isGlobalLoading || isSeriesLoading)) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = LyneAccent, strokeWidth = 2.dp)
            }
        } else {
            CatalogGrid(
                items = items,
                loading = isSeriesLoading && items.isEmpty(),
                currentPage = currentPage,
                totalPages = totalPages,
                onPageChange = { page: Int -> vm.loadSeriesPage(page) },
                onDetails = onDetails,
                headerTitle = "Séries",
                headerSubtitle = if (totalPages > 0) "Página $currentPage de $totalPages" else ""
            )
        }
    }
}
