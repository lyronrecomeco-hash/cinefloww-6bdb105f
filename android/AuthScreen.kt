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
import com.lyneflix.online.ui.theme.LyneMuted
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
            Spacer(Modifier.height(80.dp))

            // Logo
            Text(
                text = "LYNEFLIX",
                color = LyneAccent,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 6.sp
            )

            Spacer(Modifier.height(32.dp))

            // Título
            Text(
                text = if (isLogin) "Acesse sua conta" else "Crie sua conta",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(4.dp))

            Text(
                text = if (isLogin)
                    "Bem-vindo de volta. Digite seus dados para entrar."
                else
                    "Cadastre-se para salvar sua lista e muito mais.",
                color = LyneMuted,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp
            )

            Spacer(Modifier.height(32.dp))

            // Campo Nome (só no cadastro)
            AnimatedVisibility(visible = !isLogin) {
                Column {
                    FieldLabel("NOME")
                    Spacer(Modifier.height(6.dp))
                    AuthTextField(
                        value = name,
                        onValueChange = { name = it },
                        placeholder = "Seu nome",
                        leadingIcon = {
                            Icon(
                                Icons.Default.Person, null,
                                tint = LyneMuted.copy(0.5f),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    )
                    Spacer(Modifier.height(16.dp))
                }
            }

            // E-mail
            FieldLabel("E-MAIL")
            Spacer(Modifier.height(6.dp))
            AuthTextField(
                value = email,
                onValueChange = { email = it },
                placeholder = "seu@email.com",
                leadingIcon = {
                    Icon(
                        Icons.Default.Email, null,
                        tint = LyneMuted.copy(0.5f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            )

            Spacer(Modifier.height(16.dp))

            // Senha
            FieldLabel("SENHA")
            Spacer(Modifier.height(6.dp))
            AuthTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = "••••••••",
                isPassword = !showPassword,
                leadingIcon = {
                    Icon(
                        Icons.Default.Lock, null,
                        tint = LyneMuted.copy(0.5f),
                        modifier = Modifier.size(18.dp)
                    )
                },
                trailingIcon = {
                    IconButton(
                        onClick = { showPassword = !showPassword },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            if (showPassword) Icons.Default.VisibilityOff
                            else Icons.Default.Visibility,
                            null,
                            tint = LyneMuted.copy(0.5f),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            )

            // Mensagens de erro/sucesso
            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = it,
                    color = Color(0xFFEF4444),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            successMessage?.let {
                Spacer(Modifier.height(12.dp))
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
                                successMessage =
                                    result.error ?: "Verifique seu e-mail para confirmar a conta."
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
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = LyneAccent),
                shape = RoundedCornerShape(12.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp)
                    )
                } else {
                    Text(
                        text = if (isLogin) "ENTRAR" else "CRIAR CONTA",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Link alternativo — sem tabs, igual ao site
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (isLogin) "Não tem conta? " else "Já tem conta? ",
                    color = LyneMuted,
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

            Spacer(Modifier.height(24.dp))

            // Segurança
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    tint = LyneMuted.copy(0.4f),
                    modifier = Modifier.size(12.dp)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "CONEXÃO SEGURA E2E",
                    color = LyneMuted.copy(0.4f),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 1.sp
                )
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text = text,
        color = LyneMuted,
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 1.sp,
        modifier = Modifier.fillMaxWidth()
    )
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
        placeholder = {
            Text(
                placeholder,
                color = LyneMuted.copy(0.4f),
                fontSize = 14.sp
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.White.copy(alpha = 0.05f),
            unfocusedContainerColor = Color.White.copy(alpha = 0.05f),
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = LyneAccent,
            focusedIndicatorColor = LyneAccent.copy(0.5f),
            unfocusedIndicatorColor = Color.White.copy(alpha = 0.08f)
        ),
        shape = RoundedCornerShape(10.dp),
        singleLine = true,
        visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon
    )
}
