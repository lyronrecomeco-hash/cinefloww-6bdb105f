@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
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
import com.lyneflix.online.ui.theme.*

@Composable
fun MovieCard(
    item: CineVeoItem,
    onClick: () -> Unit
) {
    Column {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(8.dp))
                .background(LyneCard)
                .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(8.dp))
                .clickable { onClick() }
        ) {
            AsyncImage(
                model = item.displayPoster,
                contentDescription = item.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Gradient overlay bottom
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(0.45f))
                        )
                    )
            )

            // Rating badge — top-right (exact site clone)
            if (item.displayRating > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.60f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "★",
                            color = LyneAccent,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(2.dp))
                        Text(
                            text = "%.1f".format(item.displayRating),
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Type badge — bottom-left (exact site clone)
            Surface(
                color = LyneAccent.copy(alpha = 0.80f),
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(4.dp)
            ) {
                Text(
                    text = if (item.contentType == "movie") "FILME" else "SÉRIE",
                    color = Color.White,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.4.sp,
                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                )
            }
        }

        Spacer(Modifier.height(4.dp))

        // Title — 11sp, single line (exact site clone)
        Text(
            text = item.title,
            color = LyneText,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 13.sp
        )

        // Year — 9sp (exact site clone)
        Text(
            text = item.displayYear.ifBlank { "—" },
            color = LyneMuted,
            fontSize = 9.sp,
            fontWeight = FontWeight.Normal
        )
    }
}
