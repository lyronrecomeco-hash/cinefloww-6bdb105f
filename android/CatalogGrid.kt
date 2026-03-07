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

    Column(Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.weight(1f)
        ) {
            items(items, key = { it.tmdbId }) { item ->
                PremiumGridCard(
                    item = item,
                    onClick = { onDetails(item) }
                )
            }
        }

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

            // Rating badge — estrela amarela + número branco (igual site)
            if (item.displayRating > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.60f),
                    shape = RoundedCornerShape(bottomStart = 10.dp, topEnd = 12.dp),
                    modifier = Modifier.align(Alignment.TopEnd)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
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

            // Type badge — FILME/SÉRIE (igual site)
            Surface(
                color = if (item.isMovie) LyneRed.copy(alpha = 0.88f) else LyneAccent.copy(alpha = 0.88f),
                shape = RoundedCornerShape(topEnd = 10.dp, bottomStart = 12.dp),
                modifier = Modifier.align(Alignment.BottomStart)
            ) {
                Text(
                    text = if (item.isMovie) "FILME" else "SÉRIE",
                    color = Color.White,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.2.sp,
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                )
            }
        }

        // Título + Ano FORA do card (igual site)
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
            .background(Color(0xFF0D1017))
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .navigationBarsPadding(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
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
