@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
                .padding(horizontal = 16.dp, vertical = 10.dp),
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
                    "Animes",
                    color = LyneText,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold
                )
                if (totalPages > 1) {
                    Text(
                        "Página $currentPage de $totalPages",
                        color = LyneTextSecondary,
                        fontSize = 10.sp
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            if (items.isNotEmpty()) {
                Text(
                    "${items.size} títulos",
                    color = LyneTextSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Box(Modifier.weight(1f)) {
            if (items.isEmpty() && (isGlobalLoading || isAnimesLoading)) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = LyneAccent,
                        strokeWidth = 2.dp
                    )
                }
            } else if (items.isEmpty()) {
                Column(
                    Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.Star, null, tint = LyneAccent, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(14.dp))
                    Text("Nenhum anime encontrado", color = LyneTextSecondary, fontSize = 14.sp)
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = { vm.loadAnimePage(1) },
                        colors = ButtonDefaults.buttonColors(containerColor = LyneAccent),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Icon(Icons.Default.Refresh, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Recarregar", fontWeight = FontWeight.SemiBold)
                    }
                }
            } else {
                CatalogGrid(
                    items = items,
                    loading = isAnimesLoading && items.isEmpty(),
                    currentPage = currentPage,
                    totalPages = totalPages,
                    onPageChange = { vm.loadAnimePage(it) },
                    onDetails = onDetails
                )
            }
        }
    }
}
