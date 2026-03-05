package com.lyneflix.online.data.models

data class EpisodeNav(
    val title: String,
    val streamUrl: String,
    val season: Int,
    val episode: Int
)

sealed class Screen {
    data object Home : Screen()
    data object Movies : Screen()
    data object Series : Screen()
    data object Animes : Screen()
    data object Auth : Screen()
    data object ProfileSelector : Screen()
    data object Account : Screen()

    data class Details(val item: CineVeoItem) : Screen()
    data class Player(
        val title: String,
        val videoUrl: String,
        val subtitle: String = "",
        val episodes: List<EpisodeNav> = emptyList(),
        val currentEpisodeIndex: Int = 0
    ) : Screen()
}
