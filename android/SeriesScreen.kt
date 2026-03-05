@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import com.lyneflix.online.ui.theme.components.CatalogGrid
import com.lyneflix.online.ui.theme.*

private val SERIES_GENRES = listOf(
    null to "Todos",
    10759 to "Ação & Aventura",
    35 to "Comédia",
    18 to "Drama",
    80 to "Crime",
    9648 to "Mistério",
    10765 to "Sci-Fi & Fantasia",
    10766 to "Novela",
    10768 to "Guerra & Política",
    99 to "Documentário"
)

@Composable
fun SeriesScreen(vm: HomeViewModel, onDetails: (CineVeoItem) -> Unit) {
    val items by vm.seriesCatalog.collectAsState()
    val loading by vm.isPageLoading.collectAsState()
    val currentPage by vm.currentSeriesPage.collectAsState()
    val totalPages by vm.totalSeriesPages.collectAsState()

    var selectedGenre by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(Unit) {
        if (items.isEmpty()) vm.loadSeriesPage(1)
    }

    Column(Modifier.fillMaxSize().background(LyneBg)) {
        // Header
        Row(
            Modifier
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
            Text("Séries", color = LyneText, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (items.isNotEmpty()) {
                Text(
                    "Página $currentPage",
                    color = LyneTextSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // Filtro de gêneros
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            SERIES_GENRES.forEach { (genreId, label) ->
                val isSelected = selectedGenre == genreId
                FilterChip(
                    selected = isSelected,
                    onClick = {
                        selectedGenre = genreId
                        vm.loadSeriesPage(1, genreId)
                    },
                    label = {
                        Text(
                            label,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = LyneCard,
                        labelColor = LyneTextSecondary,
                        selectedContainerColor = LyneAccent,
                        selectedLabelColor = Color.Black
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        borderColor = Color.Transparent,
                        selectedBorderColor = Color.Transparent,
                        enabled = true,
                        selected = isSelected
                    ),
                    shape = RoundedCornerShape(20.dp)
                )
            }
        }

        Spacer(Modifier.height(4.dp))

        CatalogGrid(
            items = items,
            loading = loading,
            currentPage = currentPage,
            totalPages = totalPages,
            onPageChange = { vm.loadSeriesPage(it, selectedGenre) },
            onDetails = onDetails
        )
    }
}
