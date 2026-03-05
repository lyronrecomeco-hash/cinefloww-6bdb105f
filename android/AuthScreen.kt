@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.ui.theme.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lyneflix.online.data.SupabaseAuth
import com.lyneflix.online.ui.theme.LyneAccent
import com.lyneflix.online.ui.theme.LyneBg
import com.lyneflix.online.ui.theme.LyneCard
import com.lyneflix.online.ui.theme.LyneTextSecondary
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(
    onAuthSuccess: () -> Unit,
    onBack: () -> Unit
) {
    var isLogin by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()

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
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(60.dp))

            // Logo
            Text(
                text = "LYNEFLIX",
                color = LyneAccent,
                fontSize = 36.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 8.sp
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = if (isLogin) "Bem-vindo de volta" else "Crie sua conta",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold
            )

            Text(
                text = if (isLogin) "Entre para continuar assistindo" else "É rápido e grátis",
                color = LyneTextSecondary,
                fontSize = 14.sp
            )

            Spacer(Modifier.height(36.dp))

            // Tabs Login / Cadastro
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF1A1D2E))
                    .padding(4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isLogin) LyneAccent else Color.Transparent)
                        .clickable {
                            isLogin = true
                            errorMessage = null
                            successMessage = null
                        }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Entrar",
                        color = if (isLogin) Color.Black else LyneTextSecondary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (!isLogin) LyneAccent else Color.Transparent)
                        .clickable {
                            isLogin = false
                            errorMessage = null
                            successMessage = null
                        }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Cadastrar",
                        color = if (!isLogin) Color.Black else LyneTextSecondary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Campo Nome (só no cadastro)
            AnimatedVisibility(visible = !isLogin) {
                Column {
                    AuthTextField(
                        value = name,
                        onValueChange = { name = it },
                        placeholder = "Seu nome",
                        leadingIcon = { Icon(Icons.Default.Person, null, tint = LyneTextSecondary, modifier = Modifier.size(20.dp)) }
                    )
                    Spacer(Modifier.height(14.dp))
                }
            }

            // Email
            AuthTextField(
                value = email,
                onValueChange = { email = it },
                placeholder = "E-mail",
                leadingIcon = { Icon(Icons.Default.Email, null, tint = LyneTextSecondary, modifier = Modifier.size(20.dp)) }
            )

            Spacer(Modifier.height(14.dp))

            // Senha
            AuthTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = "Senha",
                isPassword = !showPassword,
                leadingIcon = { Icon(Icons.Default.Lock, null, tint = LyneTextSecondary, modifier = Modifier.size(20.dp)) },
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }, modifier = Modifier.size(24.dp)) {
                        Icon(
                            if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            null,
                            tint = LyneTextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            )

            Spacer(Modifier.height(8.dp))

            // Mensagens de erro/sucesso
            errorMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = it,
                    color = Color(0xFFEF4444),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            successMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = it,
                    color = Color(0xFF22C55E),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(Modifier.height(24.dp))

            // Botão principal
            Button(
                onClick = {
                    errorMessage = null
                    successMessage = null

                    if (email.isBlank() || password.isBlank()) {
                        errorMessage = "Preencha todos os campos"
                        return@Button
                    }
                    if (!isLogin && name.isBlank()) {
                        errorMessage = "Informe seu nome"
                        return@Button
                    }
                    if (password.length < 6) {
                        errorMessage = "A senha deve ter pelo menos 6 caracteres"
                        return@Button
                    }

                    isLoading = true
                    scope.launch {
                        val result = if (isLogin) {
                            SupabaseAuth.signIn(email.trim(), password)
                        } else {
                            SupabaseAuth.signUp(email.trim(), password, name.trim())
                        }

                        isLoading = false

                        if (result.success) {
                            if (result.needsConfirmation) {
                                successMessage = result.error ?: "Verifique seu e-mail para confirmar a conta."
                            } else {
                                onAuthSuccess()
                            }
                        } else {
                            errorMessage = result.error ?: "Erro desconhecido"
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = LyneAccent),
                shape = RoundedCornerShape(14.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color.Black,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp)
                    )
                } else {
                    Text(
                        text = if (isLogin) "Entrar" else "Criar Conta",
                        color = Color.Black,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Link alternativo
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (isLogin) "Não tem conta? " else "Já tem conta? ",
                    color = LyneTextSecondary,
                    fontSize = 13.sp
                )
                Text(
                    text = if (isLogin) "Cadastre-se" else "Entrar",
                    color = LyneAccent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable {
                        isLogin = !isLogin
                        errorMessage = null
                        successMessage = null
                    }
                )
            }

            Spacer(Modifier.height(40.dp))

            // Botão voltar
            TextButton(onClick = onBack) {
                Text("Voltar ao início", color = LyneTextSecondary, fontSize = 13.sp)
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    isPassword: Boolean = false,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder, color = LyneTextSecondary.copy(0.6f), fontSize = 14.sp) },
        modifier = Modifier.fillMaxWidth(),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color(0xFF1A1D2E),
            unfocusedContainerColor = Color(0xFF1A1D2E),
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = LyneAccent,
            focusedIndicatorColor = LyneAccent.copy(0.5f),
            unfocusedIndicatorColor = Color.Transparent
        ),
        shape = RoundedCornerShape(12.dp),
        singleLine = true,
        visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon
    )
}
