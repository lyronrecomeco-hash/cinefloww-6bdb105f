@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneCard
import com.lyneflix.online.ui.theme.LyneTextSecondary
import kotlinx.coroutines.launch

// Cores dos avatares (mapeia avatar_index a uma cor)
private val AVATAR_COLORS = listOf(
    Color(0xFFE50914), Color(0xFF3B82F6), Color(0xFF22C55E), Color(0xFFA855F7),
    Color(0xFFF59E0B), Color(0xFFEC4899), Color(0xFF06B6D4), Color(0xFFEF4444),
    Color(0xFF8B5CF6), Color(0xFF14B8A6), Color(0xFFF97316), Color(0xFF6366F1),
    Color(0xFF84CC16), Color(0xFFD946EF), Color(0xFF0EA5E9), Color(0xFFFF6B6B)
)

@Composable
fun ProfileSelectorScreen(
    onProfileSelected: () -> Unit,
    onLogout: () -> Unit,
    onBack: () -> Unit
) {
    var profiles by remember { mutableStateOf<List<SupabaseAuth.UserProfile>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showCreateDialog by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    // Carrega perfis
    LaunchedEffect(Unit) {
        profiles = SupabaseAuth.getProfiles()
        isLoading = false
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0A0D16), Color(0xFF111628), Color(0xFF0A0D16))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, "Voltar", tint = Color.White)
                }
                Spacer(Modifier.weight(1f))
                Text(
                    "LYNEFLIX",
                    color = LyneAccent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 3.sp
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = {
                    SupabaseAuth.signOut()
                    onLogout()
                }) {
                    Icon(Icons.Default.ExitToApp, "Sair", tint = Color(0xFFEF4444))
                }
            }

            Spacer(Modifier.height(40.dp))

            Text(
                "Quem está assistindo?",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(8.dp))

            Text(
                SupabaseAuth.currentUserEmail ?: "",
                color = LyneTextSecondary,
                fontSize = 13.sp
            )

            Spacer(Modifier.height(40.dp))

            if (isLoading) {
                CircularProgressIndicator(color = LyneAccent, strokeWidth = 2.dp, modifier = Modifier.size(32.dp))
            } else {
                // Grid de perfis
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 40.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    items(profiles) { profile ->
                        ProfileCard(
                            profile = profile,
                            isActive = profile.id == SupabaseAuth.activeProfileId,
                            onClick = {
                                SupabaseAuth.setActiveProfile(profile)
                                onProfileSelected()
                            }
                        )
                    }

                    // Botão adicionar perfil (máximo 5)
                    if (profiles.size < 5) {
                        item {
                            AddProfileCard(onClick = { showCreateDialog = true })
                        }
                    }
                }
            }
        }
    }

    // Dialog criar perfil
    if (showCreateDialog) {
        CreateProfileDialog(
            onDismiss = { showCreateDialog = false },
            onCreated = { profile ->
                showCreateDialog = false
                profiles = profiles + profile
            }
        )
    }
}

@Composable
private fun ProfileCard(
    profile: SupabaseAuth.UserProfile,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val avatarIdx = (profile.avatarIndex ?: 0).coerceIn(0, AVATAR_COLORS.size - 1)
    val avatarColor = AVATAR_COLORS[avatarIdx]
    val initial = profile.name.firstOrNull()?.uppercaseChar() ?: 'U'

    Column(
        modifier = Modifier
            .clickable { onClick() }
            .padding(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(avatarColor)
                .then(
                    if (isActive) Modifier.border(3.dp, LyneAccent, RoundedCornerShape(16.dp))
                    else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initial.toString(),
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold
            )

            // Badge kids
            if (profile.isKids) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 4.dp, y = 4.dp)
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF22C55E)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.ChildCare, null, tint = Color.White, modifier = Modifier.size(14.dp))
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = profile.name,
            color = if (isActive) Color.White else LyneTextSecondary,
            fontSize = 14.sp,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun AddProfileCard(onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .clickable { onClick() }
            .padding(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF1A1D2E))
                .border(2.dp, LyneTextSecondary.copy(0.3f), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Add, null, tint = LyneTextSecondary, modifier = Modifier.size(32.dp))
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = "Adicionar",
            color = LyneTextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun CreateProfileDialog(
    onDismiss: () -> Unit,
    onCreated: (SupabaseAuth.UserProfile) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var selectedAvatar by remember { mutableIntStateOf(0) }
    var isKids by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF141724),
        titleContentColor = Color.White,
        title = {
            Text("Novo Perfil", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        },
        text = {
            Column {
                // Nome
                TextField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = { Text("Nome do perfil", color = LyneTextSecondary.copy(0.6f)) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF1A1D2E),
                        unfocusedContainerColor = Color(0xFF1A1D2E),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        cursorColor = LyneAccent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(Modifier.height(16.dp))

                Text("Escolha uma cor", color = LyneTextSecondary, fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))

                // Grid de cores de avatar
                LazyVerticalGrid(
                    columns = GridCells.Fixed(8),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(80.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(AVATAR_COLORS.size) { index ->
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(AVATAR_COLORS[index])
                                .then(
                                    if (selectedAvatar == index) Modifier.border(2.dp, Color.White, CircleShape)
                                    else Modifier
                                )
                                .clickable { selectedAvatar = index },
                            contentAlignment = Alignment.Center
                        ) {
                            if (selectedAvatar == index) {
                                Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Kids toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.ChildCare, null, tint = LyneTextSecondary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Perfil infantil", color = Color.White, fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    Switch(
                        checked = isKids,
                        onCheckedChange = { isKids = it },
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = LyneAccent,
                            checkedThumbColor = Color.White
                        )
                    )
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = Color(0xFFEF4444), fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isBlank()) {
                        error = "Informe o nome do perfil"
                        return@Button
                    }
                    isLoading = true
                    scope.launch {
                        val profile = SupabaseAuth.createProfile(name.trim(), selectedAvatar, isKids)
                        isLoading = false
                        if (profile != null) {
                            onCreated(profile)
                        } else {
                            error = "Erro ao criar perfil"
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = LyneAccent),
                shape = RoundedCornerShape(10.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text("Criar", color = Color.Black, fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar", color = LyneTextSecondary)
            }
        }
    )
}

// ── Tela de Conta (quando já logado e com perfil) ─────────────────────────────

@Composable
fun AccountScreen(
    onSwitchProfile: () -> Unit,
    onLogout: () -> Unit,
    onBack: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LyneBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(24.dp))

            // Header
            Text(
                "Minha Conta",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(32.dp))

            // Avatar
            val avatarIdx = SupabaseAuth.activeProfileAvatar.coerceIn(0, AVATAR_COLORS.size - 1)
            val initial = SupabaseAuth.activeProfileName?.firstOrNull()?.uppercaseChar() ?: 'U'

            Box(
                modifier = Modifier
                    .size(90.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(AVATAR_COLORS[avatarIdx]),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = initial.toString(),
                    color = Color.White,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                SupabaseAuth.activeProfileName ?: "Perfil",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                SupabaseAuth.currentUserEmail ?: "",
                color = LyneTextSecondary,
                fontSize = 13.sp
            )

            Spacer(Modifier.height(36.dp))

            // Opções
            AccountOption(
                icon = Icons.Default.Edit,
                label = "Trocar Perfil",
                onClick = onSwitchProfile
            )

            Spacer(Modifier.height(12.dp))

            AccountOption(
                icon = Icons.Default.ExitToApp,
                label = "Sair da Conta",
                color = Color(0xFFEF4444),
                onClick = {
                    SupabaseAuth.signOut()
                    onLogout()
                }
            )
        }
    }
}

@Composable
private fun AccountOption(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    color: Color = Color.White,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF141724))
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = color, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}
