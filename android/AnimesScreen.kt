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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.*
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(24.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(LyneAccent)
            )
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    "Animes",
                    color = LyneText,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                if (totalPages > 0) {
                    Text(
                        "Página $currentPage de $totalPages",
                        color = Color.White.copy(alpha = 0.50f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        Box(Modifier.fillMaxWidth().weight(1f)) {
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
                    onPageChange = { page -> vm.loadAnimePage(page) },
                    onDetails = onDetails
                )
            }
        }
    }
}
