@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.data.models.CineVeoItem
import com.lyneflix.online.data.models.EpisodeNav
import com.lyneflix.online.data.models.Screen
import com.lyneflix.online.data.viewmodel.HomeViewModel
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneflixNewTheme
import com.lyneflix.online.ui.theme.screens.*
import com.lyneflix.online.ui.theme.components.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Inicializa auth
        SupabaseAuth.init(applicationContext)

        // Sincroniza manutenção e atualização publicadas no painel admin
        AppStatusManager.checkOnStartup(this)

        setContent {
            LyneflixNewTheme {
                val vm: HomeViewModel = viewModel()
                var currentScreen by remember { mutableStateOf<Screen>(Screen.Home) }
                var previousScreen by remember { mutableStateOf<Screen>(Screen.Home) }

                val movies by vm.movies.collectAsState()
                LaunchedEffect(Unit) { if (movies.isEmpty()) vm.loadAll() }

                val onDetails: (CineVeoItem) -> Unit = { item ->
                    previousScreen = currentScreen
                    currentScreen = Screen.Details(item)
                }

                val onPlay: (String, String, String, List<EpisodeNav>, Int) -> Unit =
                    { title, url, sub, episodes, idx ->
                        if (url.isNotBlank()) {
                            previousScreen = currentScreen
                            currentScreen = Screen.Player(title, url, sub, episodes, idx)
                        }
                    }

                // Determina tela de perfil/auth
                val navigateToProfile: () -> Unit = {
                    previousScreen = currentScreen
                    currentScreen = when {
                        !SupabaseAuth.isLoggedIn -> Screen.Auth
                        !SupabaseAuth.hasActiveProfile -> Screen.ProfileSelector
                        else -> Screen.Account
                    }
                }

                Scaffold(
                    containerColor = LyneBg,
                    bottomBar = {
                        val hideBottomBar = currentScreen is Screen.Details
                                || currentScreen is Screen.Player
                                || currentScreen is Screen.Auth
                                || currentScreen is Screen.ProfileSelector
                        if (!hideBottomBar) {
                            BottomNavBar(
                                currentScreen = currentScreen,
                                onScreenSelected = { selected: Screen ->
                                    currentScreen = selected
                                }
                            )
                        }
                    }
                ) { padding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .then(
                                if (currentScreen is Screen.Player) Modifier
                                else Modifier.padding(padding)
                            )
                    ) {
                        when (val screen = currentScreen) {
                            Screen.Home -> HomeScreen(
                                onItemClick = onDetails,
                                onProfileClick = navigateToProfile,
                                viewModel = vm
                            )
                            Screen.Movies -> MoviesScreen(vm = vm, onDetails = onDetails)
                            Screen.Series -> SeriesScreen(vm = vm, onDetails = onDetails)
                            Screen.Animes -> AnimesScreen(vm = vm, onDetails = onDetails)

                            Screen.Auth -> AuthScreen(
                                onAuthSuccess = {
                                    // Após login/cadastro, vai para seletor de perfil
                                    currentScreen = Screen.ProfileSelector
                                },
                                onBack = { currentScreen = Screen.Home }
                            )

                            Screen.ProfileSelector -> ProfileSelectorScreen(
                                onProfileSelected = {
                                    // Perfil selecionado, volta ao início
                                    currentScreen = Screen.Home
                                },
                                onLogout = {
                                    currentScreen = Screen.Home
                                },
                                onBack = {
                                    currentScreen = if (SupabaseAuth.isLoggedIn) Screen.Home else Screen.Auth
                                }
                            )

                            Screen.Account -> AccountScreen(
                                onSwitchProfile = {
                                    currentScreen = Screen.ProfileSelector
                                },
                                onLogout = {
                                    currentScreen = Screen.Home
                                },
                                onBack = { currentScreen = Screen.Home }
                            )

                            is Screen.Details -> {
                                DetailScreen(
                                    item = screen.item,
                                    onBack = { currentScreen = previousScreen },
                                    onDetails = onDetails,
                                    onPlay = { item, season, episode, episodeNavList, episodeIdx ->
                                        val url = item.buildDirectUrl(season, episode)
                                        val sub = if (season != null && episode != null) "T${season}:E${episode}" else ""
                                        onPlay(item.title, url, sub, episodeNavList, episodeIdx)
                                    }
                                )
                            }

                            is Screen.Player -> {
                                PlayerScreen(
                                    title = screen.title,
                                    videoUrl = screen.videoUrl,
                                    subtitle = screen.subtitle,
                                    episodes = screen.episodes,
                                    currentEpisodeIndex = screen.currentEpisodeIndex,
                                    onBack = { currentScreen = previousScreen },
                                    onPlayEpisode = { ep, idx ->
                                        currentScreen = Screen.Player(
                                            title = ep.title.ifBlank { screen.title },
                                            videoUrl = ep.streamUrl,
                                            subtitle = "T${ep.season}:E${ep.episode}",
                                            episodes = screen.episodes,
                                            currentEpisodeIndex = idx
                                        )
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
