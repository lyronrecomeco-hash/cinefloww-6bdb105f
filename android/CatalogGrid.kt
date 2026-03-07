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
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(12) {
                Column {
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(2f / 3f)
                    )
                    Spacer(Modifier.height(5.dp))
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth(0.8f)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                    )
                    Spacer(Modifier.height(3.dp))
                    GlassShimmerCard(
                        modifier = Modifier
                            .fillMaxWidth(0.4f)
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
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(items, key = { it.tmdbId }) { item ->
            PremiumGridCard(
                item = item,
                onClick = { onDetails(item) }
            )
        }

        // Paginação inline
        if (totalPages > 1) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                WebStylePagination(
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
                    .height(16.dp)
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
        targetValue = if (isPressed) 0.96f else 1f,
        animationSpec = tween(durationMillis = 120, easing = FastOutSlowInEasing),
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
                .clip(RoundedCornerShape(10.dp))
                .background(LyneCard)
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.06f),
                    shape = RoundedCornerShape(10.dp)
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

            // Badge tipo
            Surface(
                color = if (item.isMovie) LyneAccent.copy(alpha = 0.90f)
                else LyneAccent.copy(alpha = 0.90f),
                shape = RoundedCornerShape(5.dp),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(6.dp)
            ) {
                Text(
                    text = if (item.isMovie) "FILME" else "SÉRIE",
                    color = Color.White,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                )
            }

            // Gradiente inferior sutil
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.50f)
                            )
                        )
                    )
            )

            // Rating badge
            if (item.displayRating > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.55f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(5.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "★",
                            color = LyneGold,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(2.dp))
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

        Spacer(Modifier.height(5.dp))

        Text(
            text = item.title,
            color = LyneText,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 14.sp
        )

        Spacer(Modifier.height(1.dp))

        Text(
            text = item.displayYear,
            color = LyneMuted,
            fontSize = 9.sp
        )
    }
}

/**
 * Paginação estilo website
 */
@Composable
private fun WebStylePagination(
    currentPage: Int,
    totalPages: Int,
    loading: Boolean,
    onPageChange: (Int) -> Unit
) {
    val pages = buildPageNumbers(currentPage, totalPages)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        PaginationButton(
            onClick = { onPageChange(currentPage - 1) },
            enabled = currentPage > 1 && !loading
        ) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "Anterior",
                tint = if (currentPage > 1) Color.White else LyneMuted.copy(0.3f),
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(Modifier.width(3.dp))

        if (loading) {
            CircularProgressIndicator(
                color = LyneAccent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp)
            )
        } else {
            pages.forEach { page ->
                when (page) {
                    -1 -> {
                        Box(
                            modifier = Modifier.size(width = 26.dp, height = 32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "…",
                                color = LyneMuted,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                    else -> {
                        val isCurrent = page == currentPage
                        Spacer(Modifier.width(2.dp))
                        PaginationButton(
                            onClick = { if (!isCurrent) onPageChange(page) },
                            enabled = !isCurrent && !loading,
                            isActive = isCurrent,
                            minWidth = 32.dp
                        ) {
                            Text(
                                text = "$page",
                                color = if (isCurrent) Color.White else Color.White.copy(0.7f),
                                fontSize = 12.sp,
                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                                textAlign = TextAlign.Center
                            )
                        }
                        Spacer(Modifier.width(2.dp))
                    }
                }
            }
        }

        Spacer(Modifier.width(3.dp))

        PaginationButton(
            onClick = { onPageChange(currentPage + 1) },
            enabled = currentPage < totalPages && !loading
        ) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Próximo",
                tint = if (currentPage < totalPages) Color.White else LyneMuted.copy(0.3f),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun PaginationButton(
    onClick: () -> Unit,
    enabled: Boolean,
    isActive: Boolean = false,
    minWidth: androidx.compose.ui.unit.Dp = 32.dp,
    content: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = minWidth, minHeight = 32.dp)
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (isActive) {
                    Modifier.background(LyneAccent)
                } else {
                    Modifier
                        .background(Color.White.copy(alpha = 0.04f))
                        .border(
                            width = 1.dp,
                            color = Color.White.copy(alpha = 0.08f),
                            shape = RoundedCornerShape(10.dp)
                        )
                }
            )
            .then(
                if (enabled || isActive) {
                    Modifier.clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { onClick() }
                } else {
                    Modifier
                }
            )
            .then(
                if (!enabled && !isActive) Modifier.graphicsLayer { alpha = 0.3f }
                else Modifier
            ),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

private fun buildPageNumbers(current: Int, total: Int): List<Int> {
    if (total <= 7) return (1..total).toList()

    val pages = mutableListOf<Int>()
    pages.add(1)
    if (current > 3) pages.add(-1)
    for (i in maxOf(2, current - 1)..minOf(total - 1, current + 1)) {
        pages.add(i)
    }
    if (current < total - 2) pages.add(-1)
    pages.add(total)
    return pages
}
