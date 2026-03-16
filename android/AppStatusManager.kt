package com.lyneflix.app

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * AppStatusManager — Gerencia manutenção e atualização do app sincronizado com o painel admin.
 *
 * Endpoints (GET com query param):
 *   ?action=status     → retorna maintenance + update juntos
 *   ?action=maintenance → retorna só manutenção
 *   ?action=update      → retorna só atualização
 *
 * Uso:
 *   AppStatusManager.checkOnStartup(activity) // chama no onCreate da MainActivity
 */
object AppStatusManager {

    private const val TAG = "AppStatusManager"
    private const val BASE_URL = "https://lyneflix.online/functions/v1/app-catalog"
    private const val CURRENT_APP_VERSION = "2.0.0" // ← atualize a cada release

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val mainHandler = Handler(Looper.getMainLooper())

    // ══════════════════════════════════════════════
    //  CHAMADA PRINCIPAL — use no onCreate
    // ══════════════════════════════════════════════
    fun checkOnStartup(context: Context) {
        scope.launch {
            try {
                val json = fetchStatus() ?: return@launch
                val maintenance = json.optJSONObject("maintenance")
                val update = json.optJSONObject("update")

                mainHandler.post {
                    // 1) Manutenção tem prioridade
                    if (maintenance != null && maintenance.optBoolean("enabled", false)) {
                        showMaintenanceDialog(context, maintenance)
                        return@post
                    }

                    // 2) Verifica atualização
                    if (update != null) {
                        val newVersion = update.optString("new_version", "")
                        val minVersion = update.optString("min_version", "")
                        val forceUpdate = update.optBoolean("force_update", false)
                        val apkUrl = update.optString("apk_url", "")

                        if (newVersion.isNotEmpty() && isNewerVersion(newVersion, CURRENT_APP_VERSION) && apkUrl.isNotEmpty()) {
                            showUpdateDialog(context, update, forceUpdate || isNewerVersion(minVersion, CURRENT_APP_VERSION))
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao verificar status: ${e.message}")
            }
        }
    }

    // ══════════════════════════════════════════════
    //  FETCH
    // ══════════════════════════════════════════════
    private fun fetchStatus(): JSONObject? {
        val url = URL("$BASE_URL?action=status")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Content-Type", "application/json")

        return try {
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().readText()
                JSONObject(body)
            } else {
                Log.w(TAG, "Status check HTTP ${conn.responseCode}")
                null
            }
        } finally {
            conn.disconnect()
        }
    }

    // ══════════════════════════════════════════════
    //  MODAL DE MANUTENÇÃO
    // ══════════════════════════════════════════════
    private fun showMaintenanceDialog(context: Context, data: JSONObject) {
        val message = data.optString("message", "Estamos em manutenção. Voltamos em breve!")
        val estimatedMinutes = data.optInt("estimated_minutes", 30)
        val blockAccess = data.optBoolean("block_access", false)

        val builder = AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
        builder.setTitle("🔧 Manutenção em Andamento")
        builder.setMessage(
            "$message\n\n⏱ Previsão: $estimatedMinutes minutos"
        )
        builder.setCancelable(!blockAccess) // se block_access, não pode fechar

        if (blockAccess) {
            builder.setPositiveButton("Tentar novamente") { dialog, _ ->
                dialog.dismiss()
                // Rechecar
                checkOnStartup(context)
            }
        } else {
            builder.setPositiveButton("Entendido") { dialog, _ ->
                dialog.dismiss()
            }
        }

        val dialog = builder.create()
        dialog.show()

        // Se block_access, impedir voltar
        if (blockAccess) {
            dialog.setOnCancelListener {
                // re-mostrar
                showMaintenanceDialog(context, data)
            }
        }
    }

    // ══════════════════════════════════════════════
    //  MODAL DE ATUALIZAÇÃO
    // ══════════════════════════════════════════════
    private fun showUpdateDialog(context: Context, data: JSONObject, isForced: Boolean) {
        val newVersion = data.optString("new_version", "")
        val releaseNotes = data.optString("release_notes", "")
        val apkUrl = data.optString("apk_url", "")

        val builder = AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
        builder.setTitle("📦 Atualização Disponível — v$newVersion")

        val messageBuilder = StringBuilder()
        if (releaseNotes.isNotEmpty()) {
            messageBuilder.append(releaseNotes)
            messageBuilder.append("\n\n")
        }
        if (isForced) {
            messageBuilder.append("⚠️ Esta atualização é obrigatória para continuar usando o app.")
        } else {
            messageBuilder.append("Uma nova versão está disponível. Recomendamos atualizar.")
        }
        builder.setMessage(messageBuilder.toString())
        builder.setCancelable(!isForced)

        builder.setPositiveButton("Atualizar Agora") { _, _ ->
            // Abrir download do APK
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl))
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao abrir download: ${e.message}")
            }

            // Se forçado, fechar o app após iniciar download
            if (isForced) {
                Handler(Looper.getMainLooper()).postDelayed({
                    (context as? android.app.Activity)?.finishAffinity()
                }, 1500)
            }
        }

        if (!isForced) {
            builder.setNegativeButton("Depois") { dialog, _ ->
                dialog.dismiss()
            }
        }

        val dialog = builder.create()
        dialog.show()

        if (isForced) {
            dialog.setOnCancelListener {
                showUpdateDialog(context, data, true)
            }
        }
    }

    // ══════════════════════════════════════════════
    //  COMPARAR VERSÕES (semver simples)
    // ══════════════════════════════════════════════
    private fun isNewerVersion(remote: String, local: String): Boolean {
        try {
            val remoteParts = remote.split(".").map { it.toIntOrNull() ?: 0 }
            val localParts = local.split(".").map { it.toIntOrNull() ?: 0 }

            for (i in 0 until maxOf(remoteParts.size, localParts.size)) {
                val r = remoteParts.getOrElse(i) { 0 }
                val l = localParts.getOrElse(i) { 0 }
                if (r > l) return true
                if (r < l) return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao comparar versões: ${e.message}")
        }
        return false
    }
}
