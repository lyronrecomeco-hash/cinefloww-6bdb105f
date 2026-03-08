@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.ui.theme.*

@Composable
fun PaginationBar(current: Int, total: Int, onPage: (Int) -> Unit) {
    val pages = buildList {
        add(1)
        val s = maxOf(2, current - 1)
        val e = minOf(total - 1, current + 1)
        if (s > 2) add(-1)
        for (p in s..e) add(p)
        if (e < total - 1) add(-2)
        if (total > 1) add(total)
    }.distinct()

    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)).background(if (current > 1) Color.White.copy(0.08f) else Color.Transparent).clickable(enabled = current > 1) { onPage(current - 1) }, contentAlignment = Alignment.Center) {
            Icon(Icons.Default.ChevronLeft, null, tint = if (current > 1) LyneText else LyneTextSecondary.copy(0.3f), modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(4.dp))
        pages.forEach { p ->
            if (p < 0) {
                Text("…", color = LyneTextSecondary, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
            } else {
                val a = p == current
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)).background(if (a) LyneAccent else Color.White.copy(0.06f)).clickable { onPage(p) }, contentAlignment = Alignment.Center) {
                    Text("$p", color = if (a) Color.White else LyneTextSecondary, fontSize = 12.sp, fontWeight = if (a) FontWeight.Bold else FontWeight.Normal)
                }
                Spacer(Modifier.width(4.dp))
            }
        }
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)).background(if (current < total) Color.White.copy(0.08f) else Color.Transparent).clickable(enabled = current < total) { onPage(current + 1) }, contentAlignment = Alignment.Center) {
            Icon(Icons.Default.ChevronRight, null, tint = if (current < total) LyneText else LyneTextSecondary.copy(0.3f), modifier = Modifier.size(18.dp))
        }
    }
}
