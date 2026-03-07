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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.lyneflix.online.data.CineVeoApi
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneBorder
import com.lyneflix.online.ui.theme.LyneCard
import com.lyneflix.online.ui.theme.LyneRed
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
    val featured: List<CineVeoItem> by viewModel.featured.collectAsState()
    val movies: List<CineVeoItem> by viewModel.movies.collectAsState()
    val series: List<CineVeoItem> by viewModel.series.collectAsState()
    val animes: List<CineVeoItem> by viewModel.animes.collectAsState()
    val isLoading: Boolean by viewModel.isLoading.collectAsState()

    var isSearchActive by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<CineVeoItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }

    val heroItems = remember(featured, movies) {
        featured.ifEmpty { movies.take(6) }
    }

    val emAlta = remember(movies) {
        movies.distinctBy { it.tmdbId }
            .sortedByDescending { it.displayRating }
            .take(12)
    }

    val latestMovies = remember(movies) {
        movies.distinctBy { it.tmdbId }.take(12)
    }

    val popularMovies = remember(movies) {
        movies.distinctBy { it.tmdbId }
            .sortedByDescending { it.displayRating }
            .take(12)
    }

    val popularSeries = remember(series) {
        series.distinctBy { it.tmdbId }
            .sortedByDescending { it.displayRating }
            .take(12)
    }

    val popularAnimes = remember(animes) {
        animes.distinctBy { it.tmdbId }
            .sortedByDescending { it.displayRating }
            .take(12)
    }

    val localSearchSource = remember(movies, series, animes) {
        (movies + series + animes).distinctBy { it.tmdbId }
    }

    LaunchedEffect(searchQuery, localSearchSource) {
        val normalized = searchQuery.trim()
        if (normalized.length < 3) {
            isSearching = false
            searchResults = emptyList()
            return@LaunchedEffect
        }

        isSearching = true
        delay(300)

        val query = normalized.lowercase()
        val localMatches = localSearchSource
            .filter { it.title.isNotBlank() && it.title.lowercase().contains(query) }
            .distinctBy { it.tmdbId }
            .take(30)

        if (localMatches.isNotEmpty()) {
            searchResults = localMatches
            isSearching = false
            return@LaunchedEffect
        }

        try {
            val all = (
                CineVeoApi.getAllMovies() +
                    CineVeoApi.getAllSeries() +
                    CineVeoApi.getAllAnimes()
                ).distinctBy { it.tmdbId }

            searchResults = all
                .filter { it.title.isNotBlank() && it.title.lowercase().contains(query) }
                .distinctBy { it.tmdbId }
                .take(30)
        } catch (_: Exception) {
            searchResults = emptyList()
        }

        isSearching = false
    }

    Box(Modifier.fillMaxSize().background(LyneBg)) {
        if (isLoading && heroItems.isEmpty()) {
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
                        HeroSlider(
                            items = heroItems,
                            loading = isLoading && heroItems.isEmpty(),
                            onDetails = onItemClick
                        )

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

                if (emAlta.isNotEmpty()) {
                    item {
                        ContentRow(
                            title = "Em Alta",
                            items = emAlta,
                            loading = false,
                            onDetails = onItemClick
                        )
                    }
                }

                if (latestMovies.isNotEmpty()) {
                    item {
                        ContentRow(
                            title = "Últimos Adicionados",
                            items = latestMovies,
                            loading = false,
                            onDetails = onItemClick
                        )
                    }
                }

                if (popularMovies.isNotEmpty()) {
                    item {
                        ContentRow(
                            title = "Filmes Populares",
                            items = popularMovies,
                            loading = false,
                            onDetails = onItemClick
                        )
                    }
                }

                if (popularSeries.isNotEmpty()) {
                    item {
                        ContentRow(
                            title = "Séries Populares",
                            items = popularSeries,
                            loading = false,
                            onDetails = onItemClick
                        )
                    }
                }

                if (popularAnimes.isNotEmpty()) {
                    item {
                        ContentRow(
                            title = "Animes Populares",
                            items = popularAnimes,
                            loading = false,
                            onDetails = onItemClick
                        )
                    }
                }

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
                            text = "AVISO LEGAL: Nós não armazenamos nenhum dos arquivos em nenhum servidor. " +
                                "Todos os conteúdos são fornecidos por terceiros sem qualquer tipo de filiação.",
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
            .background(Color(0xF2090C14))
    ) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
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
                        Text(
                            "Buscar filmes, séries, animes...",
                            color = LyneTextSecondary,
                            fontSize = 14.sp
                        )
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
                        Icon(
                            Icons.Default.Search,
                            null,
                            tint = LyneTextSecondary,
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { onQueryChange("") }) {
                                Icon(
                                    Icons.Default.Close,
                                    null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                )
                Spacer(Modifier.width(10.dp))
                TextButton(onClick = onClose) {
                    Text(
                        "Cancelar",
                        color = LyneAccent,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                }
            }

            if (isSearching) {
                Box(
                    Modifier.fillMaxWidth().padding(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = LyneAccent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(results, key = { "${it.tmdbId}_search" }) { item ->
                    SearchResultCard(item = item, onClick = { onItemClick(item) })
                }

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
                                "Digite pelo menos 3 caracteres",
                                color = LyneTextSecondary.copy(0.6f),
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultCard(
    item: CineVeoItem,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = LyneCard.copy(alpha = 0.92f),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Color.White.copy(alpha = 0.06f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = item.displayPoster,
                contentDescription = null,
                modifier = Modifier
                    .size(56.dp, 84.dp)
                    .clip(RoundedCornerShape(10.dp)),
                contentScale = ContentScale.Crop
            )

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(Modifier.height(4.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = if (item.isMovie) LyneRed.copy(alpha = 0.16f)
                        else LyneAccent.copy(alpha = 0.16f),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (item.isMovie) LyneRed.copy(alpha = 0.30f)
                            else LyneAccent.copy(alpha = 0.30f)
                        )
                    ) {
                        Text(
                            text = if (item.isMovie) "FILME" else "SÉRIE",
                            color = if (item.isMovie) LyneRed else LyneAccent,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }

                    val year = item.displayYear.orEmpty()
                    if (year.isNotBlank()) {
                        Text(
                            text = year,
                            color = LyneTextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    if (item.displayRating > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Star,
                                null,
                                tint = Color(0xFFFFD700),
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(Modifier.width(2.dp))
                            Text(
                                text = String.format(java.util.Locale.US, "%.1f", item.displayRating),
                                color = Color(0xFFFFD700),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                val overview = item.overview.orEmpty()
                if (overview.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = overview,
                        color = LyneTextSecondary.copy(0.7f),
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
