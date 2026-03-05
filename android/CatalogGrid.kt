@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneCard
import com.lyneflix.online.ui.theme.LyneTextSecondary

@Composable
fun CatalogGrid(
    items: List<CineVeoItem>,
    loading: Boolean,
    currentPage: Int,
    totalPages: Int,
    onPageChange: (Int) -> Unit,
    onDetails: (CineVeoItem) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (loading && items.isEmpty()) {
            // Skeleton grid
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(12) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(0.65f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF1E2030))
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(items, key = { "${it.tmdbId}_${it.title}" }) { item ->
                    CatalogCard(item = item, onClick = { onDetails(item) })
                }
            }

            // Controles de paginação
            if (totalPages > 1) {
                PaginationBar(
                    currentPage = currentPage,
                    totalPages = totalPages,
                    loading = loading,
                    onPageChange = onPageChange
                )
            }
        }
    }
}

@Composable
private fun CatalogCard(item: CineVeoItem, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.65f)
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
    ) {
        AsyncImage(
            model = item.displayPoster,
            contentDescription = item.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Gradiente inferior
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(0.9f))
                    )
                )
        )

        // Rating badge
        if (item.displayRating > 0) {
            Box(
                modifier = Modifier
                    .padding(5.dp)
                    .align(Alignment.TopEnd)
                    .background(
                        color = when {
                            item.displayRating >= 7.0 -> Color(0xFF16A34A)
                            item.displayRating >= 5.0 -> Color(0xFFCA8A04)
                            else -> Color(0xFFDC2626)
                        },
                        shape = RoundedCornerShape(4.dp)
                    )
                    .padding(horizontal = 5.dp, vertical = 2.dp)
            ) {
                Text(
                    text = String.format("%.1f", item.displayRating),
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Type badge
        Box(
            modifier = Modifier
                .padding(5.dp)
                .align(Alignment.TopStart)
                .background(
                    color = if (item.isMovie) Color(0xFF3B82F6).copy(0.85f) else LyneAccent.copy(0.85f),
                    shape = RoundedCornerShape(4.dp)
                )
                .padding(horizontal = 5.dp, vertical = 2.dp)
        ) {
            Text(
                text = if (item.isMovie) "Filme" else "Série",
                color = Color.White,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Título + Ano
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 7.dp, vertical = 7.dp)
        ) {
            Text(
                text = item.title,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 13.sp
            )
            if (item.displayYear.isNotBlank()) {
                Text(
                    text = item.displayYear,
                    color = Color(0xFFB0B8C8),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun PaginationBar(
    currentPage: Int,
    totalPages: Int,
    loading: Boolean,
    onPageChange: (Int) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0D1017))
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .navigationBarsPadding(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Botão anterior
        IconButton(
            onClick = { if (currentPage > 1) onPageChange(currentPage - 1) },
            enabled = currentPage > 1 && !loading,
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "Anterior",
                tint = if (currentPage > 1) Color.White else LyneTextSecondary.copy(0.3f)
            )
        }

        Spacer(Modifier.width(12.dp))

        // Indicador de página
        Box(
            modifier = Modifier
                .background(LyneCard, RoundedCornerShape(8.dp))
                .padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            if (loading) {
                CircularProgressIndicator(
                    color = LyneAccent,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp)
                )
            } else {
                Text(
                    text = "$currentPage / $totalPages",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        // Botão próximo
        IconButton(
            onClick = { if (currentPage < totalPages) onPageChange(currentPage + 1) },
            enabled = currentPage < totalPages && !loading,
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Próximo",
                tint = if (currentPage < totalPages) Color.White else LyneTextSecondary.copy(0.3f)
            )
        }
    }
}
