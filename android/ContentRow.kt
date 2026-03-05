@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneTextSecondary

@Composable
fun ContentRow(
    title: String,
    items: List<CineVeoItem>,
    loading: Boolean = false,
    onDetails: (CineVeoItem) -> Unit
) {
    if (items.isEmpty() && !loading) return

    Column(modifier = Modifier.padding(top = 18.dp)) {
        // Título da seção com barra de acento
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(18.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(LyneAccent)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = title,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.3.sp
            )
        }

        if (loading) {
            // Skeleton loading
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(6) {
                    Box(
                        Modifier
                            .width(120.dp)
                            .height(175.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF1E2030))
                    )
                }
            }
        } else {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(items, key = { "${it.tmdbId}_${it.title}" }) { item ->
                    ContentCard(item = item, onClick = { onDetails(item) })
                }
            }
        }
    }
}

@Composable
fun ContentCard(
    item: CineVeoItem,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .width(120.dp)
            .height(190.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
    ) {
        // Poster
        AsyncImage(
            model = item.displayPoster,
            contentDescription = item.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Gradiente inferior para legibilidade
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(70.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(0.85f))
                    )
                )
        )

        // Nota no canto superior direito
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

        // Título + Ano no rodapé
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 8.dp, vertical = 8.dp)
        ) {
            Text(
                text = item.title,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 14.sp
            )
            if (item.displayYear.isNotBlank()) {
                Text(
                    text = item.displayYear,
                    color = Color(0xFFB0B8C8), // ← Cor visível! Não mais apagada
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
