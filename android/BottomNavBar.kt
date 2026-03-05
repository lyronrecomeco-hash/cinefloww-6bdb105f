@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.data.models.Screen
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneTextSecondary

private data class BottomNavItem(
    val title: String,
    val icon: ImageVector,
    val screen: Screen
)

@Composable
fun BottomNavBar(
    currentScreen: Screen,
    onScreenSelected: (Screen) -> Unit
) {
    val isLoggedIn = SupabaseAuth.isLoggedIn
    val accountScreen = if (isLoggedIn) {
        if (SupabaseAuth.hasActiveProfile) Screen.Account else Screen.ProfileSelector
    } else {
        Screen.Auth
    }

    val items = listOf(
        BottomNavItem("Início", Icons.Filled.Home, Screen.Home),
        BottomNavItem("Filmes", Icons.Filled.Movie, Screen.Movies),
        BottomNavItem("Séries", Icons.Filled.Tv, Screen.Series),
        BottomNavItem("Animes", Icons.Filled.Star, Screen.Animes),
        BottomNavItem("Conta", Icons.Filled.Person, accountScreen)
    )

    Surface(
        color = LyneBg,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            HorizontalDivider(
                thickness = 0.5.dp,
                color = Color.White.copy(alpha = 0.08f)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 6.dp)
                    .navigationBarsPadding(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                items.forEach { item ->
                    val isSelected = when {
                        item.screen is Screen.Home && currentScreen is Screen.Home -> true
                        item.screen is Screen.Movies && currentScreen is Screen.Movies -> true
                        item.screen is Screen.Series && currentScreen is Screen.Series -> true
                        item.screen is Screen.Animes && currentScreen is Screen.Animes -> true
                        item.screen is Screen.Auth && (currentScreen is Screen.Auth || currentScreen is Screen.ProfileSelector || currentScreen is Screen.Account) -> true
                        item.screen is Screen.ProfileSelector && (currentScreen is Screen.Auth || currentScreen is Screen.ProfileSelector || currentScreen is Screen.Account) -> true
                        item.screen is Screen.Account && (currentScreen is Screen.Auth || currentScreen is Screen.ProfileSelector || currentScreen is Screen.Account) -> true
                        else -> false
                    }
                    val color = if (isSelected) LyneAccent else LyneTextSecondary

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = { onScreenSelected(item.screen) }
                            ),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Avatar especial para conta quando logado com perfil
                        if (item.title == "Conta" && isLoggedIn && SupabaseAuth.hasActiveProfile) {
                            val initial = SupabaseAuth.activeProfileName?.firstOrNull()?.uppercaseChar() ?: 'U'
                            Box(
                                modifier = Modifier
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(if (isSelected) LyneAccent else LyneTextSecondary.copy(0.3f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = initial.toString(),
                                    color = if (isSelected) Color.Black else Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        } else {
                            Icon(
                                imageVector = item.icon,
                                contentDescription = item.title,
                                tint = color,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = item.title,
                            color = color,
                            fontSize = 10.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}
