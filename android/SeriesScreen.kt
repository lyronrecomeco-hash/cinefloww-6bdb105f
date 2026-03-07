@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.components.CatalogGrid
import com.lyneflix.online.ui.theme.*

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(22.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(LyneAccent)
            )
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    "Séries",
                    color = LyneText,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold
                )
                if (totalPages > 1) {
                    Text(
                        "Página $currentPage de $totalPages",
                        color = LyneMuted,
                        fontSize = 10.sp
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            if (items.isNotEmpty()) {
                Text(
                    "${items.size} títulos",
                    color = LyneMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Box(Modifier.weight(1f)) {
            if (items.isEmpty() && (isGlobalLoading || isSeriesLoading)) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = LyneAccent,
                        strokeWidth = 2.dp
                    )
                }
            } else {
                CatalogGrid(
                    items = items,
                    loading = isSeriesLoading && items.isEmpty(),
                    currentPage = currentPage,
                    totalPages = totalPages,
                    onPageChange = { page -> vm.loadSeriesPage(page) },
                    onDetails = onDetails
                )
            }
        }
    }
}
