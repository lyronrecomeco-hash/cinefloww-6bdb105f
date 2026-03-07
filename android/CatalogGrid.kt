@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.ui.theme.*

@Composable
fun CatalogGrid(
    items: List<CineVeoItem>,
    loading: Boolean,
    currentPage: Int,
    totalPages: Int,
    onPageChange: (Int) -> Unit,
    onDetails: (CineVeoItem) -> Unit
) {
    if (loading && items.isEmpty()) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(12) {
                Column {
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(2f / 3f)
                    )
                    Spacer(Modifier.height(6.dp))
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth(0.82f)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                    )
                    Spacer(Modifier.height(3.dp))
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth(0.42f)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                    )
                }
            }
        }
        return
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(items, key = { it.tmdbId }) { item ->
            PremiumGridCard(
                item = item,
                onClick = { onDetails(item) }
            )
        }

        // Paginação inline (rola junto com o conteúdo)
        if (totalPages > 1) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                PaginationBar(
                    currentPage = currentPage,
                    totalPages = totalPages,
                    loading = loading,
                    onPageChange = onPageChange
                )
            }
        }

        // Espaço para o BottomNav
        item(span = { GridItemSpan(maxLineSpan) }) {
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .height(80.dp)
            )
        }
    }
}

@Composable
private fun PremiumGridCard(
    item: CineVeoItem,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.95f else 1f,
        animationSpec = tween(durationMillis = 150, easing = FastOutSlowInEasing),
        label = "gridCardScale"
    )

    Column {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(12.dp))
                .background(LyneCard)
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.05f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable(
                    interactionSource = interactionSource,
                    indication = null
                ) { onClick() }
        ) {
            AsyncImage(
                model = item.displayPoster,
                contentDescription = item.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Gradiente sutil no rodapé
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.10f),
                                Color.Black.copy(alpha = 0.70f)
                            )
                        )
                    )
            )

            // Rating badge — canto superior direito
            if (item.displayRating > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.60f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "★",
                            color = LyneGold,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(3.dp))
                        Text(
                            text = "%.1f".format(item.displayRating),
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Título + Ano
        Spacer(Modifier.height(7.dp))

        Text(
            text = item.title,
            color = LyneText,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 14.sp
        )

        Spacer(Modifier.height(2.dp))

        Text(
            text = item.displayYear,
            color = LyneTextSecondary,
            fontSize = 9.sp,
            fontWeight = FontWeight.Medium
        )
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
            .padding(vertical = 20.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Botão anterior
        Surface(
            onClick = { if (currentPage > 1 && !loading) onPageChange(currentPage - 1) },
            enabled = currentPage > 1 && !loading,
            color = if (currentPage > 1) LyneCard else Color.Transparent,
            shape = CircleShape,
            modifier = Modifier.size(38.dp)
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = "Anterior",
                    tint = if (currentPage > 1) Color.White else LyneTextSecondary.copy(0.3f),
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        Spacer(Modifier.width(16.dp))

        // Indicador de página
        if (loading) {
            CircularProgressIndicator(
                color = LyneAccent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp)
            )
        } else {
            // Bolinhas de página (mostra até 5 páginas)
            val visiblePages = buildList {
                val start = maxOf(1, currentPage - 2)
                val end = minOf(totalPages, start + 4)
                for (i in start..end) add(i)
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                visiblePages.forEach { page ->
                    val isCurrent = page == currentPage
                    Surface(
                        onClick = { if (!isCurrent && !loading) onPageChange(page) },
                        color = if (isCurrent) LyneAccent else LyneCard,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.size(
                            width = if (isCurrent) 36.dp else 32.dp,
                            height = 32.dp
                        )
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Text(
                                text = "$page",
                                color = if (isCurrent) Color.Black else LyneTextSecondary,
                                fontSize = 13.sp,
                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.width(16.dp))

        // Botão próximo
        Surface(
            onClick = { if (currentPage < totalPages && !loading) onPageChange(currentPage + 1) },
            enabled = currentPage < totalPages && !loading,
            color = if (currentPage < totalPages) LyneCard else Color.Transparent,
            shape = CircleShape,
            modifier = Modifier.size(38.dp)
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Próximo",
                    tint = if (currentPage < totalPages) Color.White else LyneTextSecondary.copy(0.3f),
                    modifier = Modifier.size(22.dp)
                )
            }
        }
    }
}
