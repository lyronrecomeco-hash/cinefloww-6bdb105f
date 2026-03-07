@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.lyneflix.online.data.AppCatalogApi
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneBorder
import com.lyneflix.online.ui.theme.LyneCard
import com.lyneflix.online.ui.theme.LyneTextSecondary
import com.lyneflix.online.ui.theme.components.ContentRow
import com.lyneflix.online.ui.theme.components.HeroSlider
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    onItemClick: (CineVeoItem) -> Unit,
    onProfileClick: () -> Unit = {},
    viewModel: HomeViewModel = viewModel()
) {
    val featured by viewModel.featured.collectAsState()
    val emAlta by viewModel.emAlta.collectAsState()
    val movies by viewModel.movies.collectAsState()
    val series by viewModel.series.collectAsState()
    val animes by viewModel.animes.collectAsState()
    val doramas by viewModel.doramas.collectAsState()
    val recentlyAdded by viewModel.recentlyAdded.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    var isSearchActive by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<CineVeoItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }

    // Busca via edge function (app-catalog)
    LaunchedEffect(searchQuery) {
        if (searchQuery.length > 2) {
            isSearching = true
            delay(500)
            searchResults = AppCatalogApi.search(searchQuery)
            isSearching = false
        } else {
            searchResults = emptyList()
        }
    }

    Box(Modifier.fillMaxSize().background(LyneBg)) {
        if (isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "LYNEFLIX",
                        color = LyneAccent,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 6.sp
                    )
                    Spacer(Modifier.height(20.dp))
                    CircularProgressIndicator(
                        color = LyneAccent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                item {
                    Box {
                        HeroSlider(items = featured, loading = isLoading, onDetails = onItemClick)

                        // Header: LYNEFLIX + Buscar + Perfil
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                                .padding(horizontal = 16.dp, vertical = 0.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "LYNEFLIX",
                                color = LyneAccent,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 3.sp
                            )

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // Botão buscar
                                IconButton(
                                    onClick = { isSearchActive = true },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Color.Black.copy(0.4f))
                                ) {
                                    Icon(
                                        Icons.Default.Search,
                                        "Buscar",
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }

                                // Botão perfil / login
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (SupabaseAuth.hasActiveProfile)
                                                LyneAccent
                                            else
                                                Color.Black.copy(0.4f)
                                        )
                                        .clickable { onProfileClick() },
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (SupabaseAuth.hasActiveProfile) {
                                        val initial = SupabaseAuth.activeProfileName
                                            ?.firstOrNull()?.uppercaseChar() ?: 'U'
                                        Text(
                                            text = initial.toString(),
                                            color = Color.Black,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    } else {
                                        Icon(
                                            Icons.Default.Person,
                                            "Entrar",
                                            tint = Color.White,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Seções de conteúdo ──────────────────────────────────────
                if (emAlta.isNotEmpty()) {
                    item {
                        ContentRow(title = "Em Alta", items = emAlta, loading = false, onDetails = onItemClick)
                    }
                }

                if (recentlyAdded.isNotEmpty()) {
                    item {
                        ContentRow(title = "Últimos Adicionados", items = recentlyAdded, loading = false, onDetails = onItemClick)
                    }
                }

                if (movies.isNotEmpty()) {
                    item {
                        ContentRow(title = "Filmes Populares", items = movies, loading = false, onDetails = onItemClick)
                    }
                }

                if (series.isNotEmpty()) {
                    item {
                        ContentRow(title = "Séries Populares", items = series, loading = false, onDetails = onItemClick)
                    }
                }

                if (doramas.isNotEmpty()) {
                    item {
                        ContentRow(title = "Doramas", items = doramas, loading = false, onDetails = onItemClick)
                    }
                }

                if (animes.isNotEmpty()) {
                    item {
                        ContentRow(title = "Animes", items = animes, loading = false, onDetails = onItemClick)
                    }
                }

                // Rodapé AVISO LEGAL — mesmo texto do site
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = LyneBorder,
                            modifier = Modifier.padding(bottom = 10.dp)
                        )
                        Text(
                            text = "LYNEFLIX",
                            color = LyneAccent.copy(alpha = 0.70f),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.8.sp
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "AVISO LEGAL: Nós não armazenamos nenhum dos arquivos em nenhum servidor. Todos os conteúdos são fornecidos por terceiros sem qualquer tipo de filiação.",
                            color = LyneTextSecondary.copy(alpha = 0.60f),
                            fontSize = 9.sp,
                            lineHeight = 13.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "© 2026 LyneFlix. Todos os direitos reservados.",
                            color = LyneTextSecondary.copy(alpha = 0.40f),
                            fontSize = 8.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }

        // ── Overlay de Busca ────────────────────────────────────────────────
        if (isSearchActive) {
            SearchOverlay(
                query = searchQuery,
                onQueryChange = { searchQuery = it },
                results = searchResults,
                isSearching = isSearching,
                onClose = {
                    isSearchActive = false
                    searchQuery = ""
                    searchResults = emptyList()
                },
                onItemClick = { item ->
                    isSearchActive = false
                    searchQuery = ""
                    searchResults = emptyList()
                    onItemClick(item)
                }
            )
        }
    }
}

// ── Overlay de busca redesenhado ─────────────────────────────────────────────

@Composable
private fun SearchOverlay(
    query: String,
    onQueryChange: (String) -> Unit,
    results: List<CineVeoItem>,
    isSearching: Boolean,
    onClose: () -> Unit,
    onItemClick: (CineVeoItem) -> Unit
) {
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xF2090C14)) // Escuro quase opaco
    ) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
            // Barra de busca
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextField(
                    value = query,
                    onValueChange = onQueryChange,
                    placeholder = {
                        Text("Buscar filmes, séries, animes...", color = LyneTextSecondary, fontSize = 14.sp)
                    },
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF1A1D2E),
                        unfocusedContainerColor = Color(0xFF1A1D2E),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        cursorColor = LyneAccent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    shape = RoundedCornerShape(14.dp),
                    singleLine = true,
                    leadingIcon = {
                        Icon(Icons.Default.Search, null, tint = LyneTextSecondary, modifier = Modifier.size(20.dp))
                    },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { onQueryChange("") }) {
                                Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                )
                Spacer(Modifier.width(10.dp))
                TextButton(onClick = onClose) {
                    Text("Cancelar", color = LyneAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                }
            }

            // Loading
            if (isSearching) {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = LyneAccent, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
            }

            // Resultados
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(results, key = { "${it.tmdbId}_search" }) { item ->
                    SearchResultCard(item = item, onClick = { onItemClick(item) })
                }

                // Estado vazio
                if (results.isEmpty() && query.length > 2 && !isSearching) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 60.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                Icons.Default.Search,
                                null,
                                tint = LyneTextSecondary.copy(0.4f),
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                "Nenhum resultado encontrado",
                                color = LyneTextSecondary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                "Tente buscar por outro título",
                                color = LyneTextSecondary.copy(0.6f),
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                // Dica inicial
                if (query.length <= 2 && results.isEmpty() && !isSearching) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 60.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                "O que vamos assistir?",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Digite pelo menos 3 caracteres para buscar",
                                color = LyneTextSecondary,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Card de resultado de busca redesenhado ───────────────────────────────────

@Composable
private fun SearchResultCard(item: CineVeoItem, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF141724))
            .clickable { onClick() }
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Poster
        Box(
            modifier = Modifier
                .width(65.dp)
                .height(95.dp)
                .clip(RoundedCornerShape(8.dp))
        ) {
            AsyncImage(
                model = item.displayPoster,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        Spacer(Modifier.width(14.dp))

        // Info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.title,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 19.sp
            )

            Spacer(Modifier.height(6.dp))

            // Badges: Tipo + Ano + Nota
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Tipo badge
                Box(
                    modifier = Modifier
                        .background(
                            color = if (item.isMovie) Color(0xFF3B82F6).copy(0.2f) else LyneAccent.copy(0.2f),
                            shape = RoundedCornerShape(4.dp)
                        )
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = if (item.isMovie) "Filme" else "Série",
                        color = if (item.isMovie) Color(0xFF60A5FA) else LyneAccent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Ano
                if (item.displayYear.isNotBlank()) {
                    Text(
                        text = item.displayYear,
                        color = Color(0xFFB0B8C8),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Nota
                if (item.displayRating > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Star,
                            null,
                            tint = Color(0xFFFBBF24),
                            modifier = Modifier.size(13.dp)
                        )
                        Spacer(Modifier.width(3.dp))
                        Text(
                            text = String.format("%.1f", item.displayRating),
                            color = Color(0xFFFBBF24),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Overview (truncado)
            if (item.displayOverview.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = item.displayOverview,
                    color = LyneTextSecondary.copy(0.7f),
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 15.sp
                )
            }
        }
    }
}
