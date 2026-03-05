@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import com.lyneflix.online.data.network.SafeHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Autenticação e gerenciamento de perfis via Supabase REST API.
 * Usa SharedPreferences para persistir sessão.
 */
object SupabaseAuth {

    private const val TAG = "SupabaseAuth"
    private const val SUPABASE_URL = "https://mfcnkltcdvitxczjwoer.supabase.co"
    private const val ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mY25rbHRjZHZpdHhjemp3b2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzExOTgsImV4cCI6MjA4NjgwNzE5OH0.g8R1h217oI-y7zeBsvN7kfE9aPMlQZEEEbRCQLAEbXA"
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    private lateinit var prefs: SharedPreferences

    // ── Modelos ──────────────────────────────────────────────────────────────

    data class AuthResult(
        val success: Boolean,
        val error: String? = null,
        val userId: String? = null,
        val needsConfirmation: Boolean = false
    )

    data class UserProfile(
        val id: String = "",
        @SerializedName("user_id") val userId: String = "",
        val name: String = "",
        @SerializedName("avatar_index") val avatarIndex: Int? = null,
        @SerializedName("is_kids") val isKids: Boolean = false,
        @SerializedName("is_default") val isDefault: Boolean? = null,
        @SerializedName("share_code") val shareCode: String? = null,
        @SerializedName("created_at") val createdAt: String? = null
    )

    // ── Inicialização ────────────────────────────────────────────────────────

    fun init(context: Context) {
        prefs = context.getSharedPreferences("lyneflix_auth", Context.MODE_PRIVATE)
    }

    // ── Estado da sessão ─────────────────────────────────────────────────────

    val isLoggedIn: Boolean get() = getToken() != null
    val currentUserId: String? get() = prefs.getString("user_id", null)
    val currentUserEmail: String? get() = prefs.getString("user_email", null)

    fun getToken(): String? = prefs.getString("access_token", null)

    // ── Perfil ativo ─────────────────────────────────────────────────────────

    val activeProfileId: String? get() = prefs.getString("active_profile_id", null)
    val activeProfileName: String? get() = prefs.getString("active_profile_name", null)
    val activeProfileAvatar: Int get() = prefs.getInt("active_profile_avatar", 0)
    val hasActiveProfile: Boolean get() = activeProfileId != null

    fun setActiveProfile(profile: UserProfile) {
        prefs.edit()
            .putString("active_profile_id", profile.id)
            .putString("active_profile_name", profile.name)
            .putInt("active_profile_avatar", profile.avatarIndex ?: 0)
            .apply()
    }

    fun clearActiveProfile() {
        prefs.edit()
            .remove("active_profile_id")
            .remove("active_profile_name")
            .remove("active_profile_avatar")
            .apply()
    }

    // ── Cadastro ─────────────────────────────────────────────────────────────

    suspend fun signUp(email: String, password: String, name: String): AuthResult =
        withContext(Dispatchers.IO) {
            try {
                val body = gson.toJson(
                    mapOf(
                        "email" to email,
                        "password" to password,
                        "data" to mapOf("name" to name)
                    )
                )
                val request = okhttp3.Request.Builder()
                    .url("$SUPABASE_URL/auth/v1/signup")
                    .post(body.toRequestBody(JSON_TYPE))
                    .addHeader("apikey", ANON_KEY)
                    .addHeader("Content-Type", "application/json")
                    .build()

                val response = SafeHttpClient.instance.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val json = JsonParser.parseString(responseBody).asJsonObject
                    val accessToken = json.get("access_token")?.let {
                        if (it.isJsonNull) null else it.asString
                    }
                    if (accessToken != null && accessToken.isNotBlank()) {
                        saveTokens(json)
                        // Criar perfil padrão automaticamente
                        val userId = json.getAsJsonObject("user")?.get("id")?.asString
                        if (userId != null) {
                            createDefaultProfile(name, accessToken, userId)
                        }
                        AuthResult(success = true, userId = userId)
                    } else {
                        AuthResult(
                            success = true,
                            needsConfirmation = true,
                            error = "Verifique seu e-mail para confirmar a conta."
                        )
                    }
                } else {
                    val json = try {
                        JsonParser.parseString(responseBody).asJsonObject
                    } catch (_: Exception) { null }
                    val msg = json?.get("msg")?.asString
                        ?: json?.get("error_description")?.asString
                        ?: json?.get("message")?.asString
                        ?: "Erro ao criar conta"
                    AuthResult(false, error = translateError(msg))
                }
            } catch (e: Exception) {
                AuthResult(false, error = "Erro de conexão: ${e.message}")
            }
        }

    // ── Login ────────────────────────────────────────────────────────────────

    suspend fun signIn(email: String, password: String): AuthResult =
        withContext(Dispatchers.IO) {
            try {
                val body = gson.toJson(mapOf("email" to email, "password" to password))
                val request = okhttp3.Request.Builder()
                    .url("$SUPABASE_URL/auth/v1/token?grant_type=password")
                    .post(body.toRequestBody(JSON_TYPE))
                    .addHeader("apikey", ANON_KEY)
                    .addHeader("Content-Type", "application/json")
                    .build()

                val response = SafeHttpClient.instance.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val json = JsonParser.parseString(responseBody).asJsonObject
                    saveTokens(json)
                    AuthResult(
                        success = true,
                        userId = json.getAsJsonObject("user")?.get("id")?.asString
                    )
                } else {
                    val json = try {
                        JsonParser.parseString(responseBody).asJsonObject
                    } catch (_: Exception) { null }
                    val msg = json?.get("error_description")?.asString
                        ?: json?.get("msg")?.asString
                        ?: "Email ou senha incorretos"
                    AuthResult(false, error = translateError(msg))
                }
            } catch (e: Exception) {
                AuthResult(false, error = "Erro de conexão: ${e.message}")
            }
        }

    // ── Logout ───────────────────────────────────────────────────────────────

    fun signOut() {
        prefs.edit().clear().apply()
    }

    // ── Perfis (user_profiles) ───────────────────────────────────────────────

    suspend fun getProfiles(): List<UserProfile> = withContext(Dispatchers.IO) {
        val userId = currentUserId ?: return@withContext emptyList()
        val token = getToken() ?: return@withContext emptyList()
        try {
            val request = okhttp3.Request.Builder()
                .url("$SUPABASE_URL/rest/v1/user_profiles?user_id=eq.$userId&select=*&order=created_at.asc")
                .get()
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .build()

            val response = SafeHttpClient.instance.newCall(request).execute()
            val body = response.body?.string() ?: "[]"

            if (response.isSuccessful) {
                val type = object : TypeToken<List<UserProfile>>() {}.type
                gson.fromJson(body, type) ?: emptyList()
            } else {
                Log.w(TAG, "getProfiles HTTP ${response.code}: $body")
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "getProfiles error: ${e.message}")
            emptyList()
        }
    }

    suspend fun createProfile(
        name: String,
        avatarIndex: Int,
        isKids: Boolean = false
    ): UserProfile? = withContext(Dispatchers.IO) {
        val userId = currentUserId ?: return@withContext null
        val token = getToken() ?: return@withContext null
        try {
            val existing = getProfiles()
            val isFirst = existing.isEmpty()

            val body = gson.toJson(
                mapOf(
                    "user_id" to userId,
                    "name" to name,
                    "avatar_index" to avatarIndex,
                    "is_kids" to isKids,
                    "is_default" to isFirst
                )
            )
            val request = okhttp3.Request.Builder()
                .url("$SUPABASE_URL/rest/v1/user_profiles")
                .post(body.toRequestBody(JSON_TYPE))
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=representation")
                .build()

            val response = SafeHttpClient.instance.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (response.isSuccessful) {
                val arr = JsonParser.parseString(responseBody).asJsonArray
                if (arr.size() > 0) gson.fromJson(arr[0], UserProfile::class.java) else null
            } else {
                Log.w(TAG, "createProfile HTTP ${response.code}: $responseBody")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "createProfile error: ${e.message}")
            null
        }
    }

    suspend fun deleteProfile(profileId: String): Boolean = withContext(Dispatchers.IO) {
        val token = getToken() ?: return@withContext false
        try {
            val request = okhttp3.Request.Builder()
                .url("$SUPABASE_URL/rest/v1/user_profiles?id=eq.$profileId")
                .delete()
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .build()
            val response = SafeHttpClient.instance.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            Log.e(TAG, "deleteProfile error: ${e.message}")
            false
        }
    }

    // ── Internos ─────────────────────────────────────────────────────────────

    private suspend fun createDefaultProfile(name: String, token: String, userId: String) {
        try {
            val body = gson.toJson(
                mapOf(
                    "user_id" to userId,
                    "name" to name,
                    "avatar_index" to 0,
                    "is_kids" to false,
                    "is_default" to true
                )
            )
            val request = okhttp3.Request.Builder()
                .url("$SUPABASE_URL/rest/v1/user_profiles")
                .post(body.toRequestBody(JSON_TYPE))
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=representation")
                .build()
            SafeHttpClient.instance.newCall(request).execute()
            Log.i(TAG, "Perfil padrão criado para $name")
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao criar perfil padrão: ${e.message}")
        }
    }

    private fun saveTokens(json: com.google.gson.JsonObject) {
        val accessToken = json.get("access_token")?.asString
        val refreshToken = json.get("refresh_token")?.asString
        val user = json.getAsJsonObject("user")
        val userId = user?.get("id")?.asString
        val email = user?.get("email")?.asString

        prefs.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .putString("user_id", userId)
            .putString("user_email", email)
            .apply()

        Log.i(TAG, "Sessão salva para $email")
    }

    private fun translateError(msg: String): String = when {
        msg.contains("already registered", true) -> "Este e-mail já está cadastrado"
        msg.contains("Invalid login", true) -> "E-mail ou senha incorretos"
        msg.contains("Email not confirmed", true) -> "Confirme seu e-mail antes de entrar"
        msg.contains("Password should be", true) -> "A senha deve ter pelo menos 6 caracteres"
        msg.contains("rate limit", true) -> "Muitas tentativas, aguarde um momento"
        else -> msg
    }
}
