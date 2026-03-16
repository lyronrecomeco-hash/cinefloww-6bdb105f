@file:Suppress("SpellCheckingInspection")
package com.lyneflix.online

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * AppStatusManager — Sincroniza manutenção e atualização do app com o painel admin.
 *
 * Endpoints (GET):
 *   https://lyneflix.online/functions/v1/app-catalog?action=status
 *   https://lyneflix.online/functions/v1/app-catalog?action=maintenance
 *   https://lyneflix.online/functions/v1/app-catalog?action=update
 *
 * Campos de manutenção (site_settings key = "app_maintenance"):
 *   enabled: Boolean          — ativa/desativa manutenção
 *   message: String           — mensagem exibida ao usuário
 *   estimated_minutes: Int    — previsão em minutos
 *   block_access: Boolean     — true = bloqueia o app, false = apenas aviso
 *
 * Campos de atualização (site_settings key = "app_update"):
 *   current_version: String   — versão publicada no admin
 *   new_version: String       — versão mais recente
 *   min_version: String       — versão mínima obrigatória
 *   release_notes: String     — notas da versão
 *   force_update: Boolean     — forçar atualização
 *   apk_url: String           — link direto do APK
 *
 * Uso no onCreate da MainActivity:
 *   AppStatusManager.checkOnStartup(this)
 */
object AppStatusManager {

    private const val TAG = "AppStatusManager"
    private const val BASE_URL = "https://lyneflix.online/functions/v1/app-catalog"

    // ═══════════════════════════════════════════════════
    //  ATUALIZE AQUI A CADA RELEASE DO APP
    // ═══════════════════════════════════════════════════
    private const val CURRENT_APP_VERSION = "2.0.0"

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val mainHandler = Handler(Looper.getMainLooper())

    // ═══════════════════════════════════════════════════
    //  CHAMADA PRINCIPAL — use no onCreate
    // ═══════════════════════════════════════════════════
    fun checkOnStartup(context: Context) {
        scope.launch {
            try {
                val json = fetchJson("$BASE_URL?action=status") ?: return@launch

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
                            val isMandatory = forceUpdate || isNewerVersion(minVersion, CURRENT_APP_VERSION)
                            showUpdateDialog(context, update, isMandatory)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao verificar status: ${e.message}")
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  CHECAR APENAS MANUTENÇÃO (uso avulso)
    // ═══════════════════════════════════════════════════
    fun checkMaintenance(context: Context, onResult: (enabled: Boolean, message: String, blockAccess: Boolean) -> Unit) {
        scope.launch {
            try {
                val json = fetchJson("$BASE_URL?action=maintenance")
                val enabled = json?.optBoolean("enabled", false) ?: false
                val message = json?.optString("message", "Manutenção em andamento") ?: "Manutenção em andamento"
                val block = json?.optBoolean("block_access", false) ?: false
                mainHandler.post { onResult(enabled, message, block) }
            } catch (e: Exception) {
                Log.e(TAG, "Erro checkMaintenance: ${e.message}")
                mainHandler.post { onResult(false, "", false) }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  CHECAR APENAS ATUALIZAÇÃO (uso avulso)
    // ═══════════════════════════════════════════════════
    fun checkUpdate(context: Context, onResult: (hasUpdate: Boolean, newVersion: String, apkUrl: String, forced: Boolean) -> Unit) {
        scope.launch {
            try {
                val json = fetchJson("$BASE_URL?action=update")
                if (json == null) {
                    mainHandler.post { onResult(false, "", "", false) }
                    return@launch
                }
                val newVersion = json.optString("new_version", "")
                val minVersion = json.optString("min_version", "")
                val forceUpdate = json.optBoolean("force_update", false)
                val apkUrl = json.optString("apk_url", "")
                val hasUpdate = newVersion.isNotEmpty() && isNewerVersion(newVersion, CURRENT_APP_VERSION) && apkUrl.isNotEmpty()
                val isMandatory = forceUpdate || isNewerVersion(minVersion, CURRENT_APP_VERSION)
                mainHandler.post { onResult(hasUpdate, newVersion, apkUrl, isMandatory) }
            } catch (e: Exception) {
                Log.e(TAG, "Erro checkUpdate: ${e.message}")
                mainHandler.post { onResult(false, "", "", false) }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  FETCH JSON
    // ═══════════════════════════════════════════════════
    private fun fetchJson(endpoint: String): JSONObject? {
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Content-Type", "application/json")
        }
        return try {
            if (conn.responseCode == 200) {
                JSONObject(conn.inputStream.bufferedReader().readText())
            } else {
                Log.w(TAG, "HTTP ${conn.responseCode} for $endpoint")
                null
            }
        } finally {
            conn.disconnect()
        }
    }

    // ═══════════════════════════════════════════════════
    //  MODAL DE MANUTENÇÃO
    // ═══════════════════════════════════════════════════
    private fun showMaintenanceDialog(context: Context, data: JSONObject) {
        val message = data.optString("message", "Estamos em manutenção. Voltamos em breve!")
        val estimatedMinutes = data.optInt("estimated_minutes", 30)
        val blockAccess = data.optBoolean("block_access", false)

        val builder = AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("🔧 Manutenção em Andamento")
            .setMessage("$message\n\n⏱ Previsão: $estimatedMinutes minutos")
            .setCancelable(!blockAccess)

        if (blockAccess) {
            builder.setPositiveButton("Tentar novamente") { dialog, _ ->
                dialog.dismiss()
                checkOnStartup(context) // rechecar
            }
        } else {
            builder.setPositiveButton("Entendido") { dialog, _ -> dialog.dismiss() }
        }

        val dialog = builder.create()
        dialog.show()

        if (blockAccess) {
            dialog.setOnCancelListener { showMaintenanceDialog(context, data) }
        }
    }

    // ═══════════════════════════════════════════════════
    //  MODAL DE ATUALIZAÇÃO
    // ═══════════════════════════════════════════════════
    private fun showUpdateDialog(context: Context, data: JSONObject, isForced: Boolean) {
        val newVersion = data.optString("new_version", "")
        val releaseNotes = data.optString("release_notes", "")
        val apkUrl = data.optString("apk_url", "")

        val msgBuilder = StringBuilder()
        if (releaseNotes.isNotEmpty()) {
            msgBuilder.append(releaseNotes).append("\n\n")
        }
        if (isForced) {
            msgBuilder.append("⚠️ Esta atualização é obrigatória para continuar usando o app.")
        } else {
            msgBuilder.append("Uma nova versão está disponível. Recomendamos atualizar.")
        }

        val builder = AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("📦 Atualização v$newVersion")
            .setMessage(msgBuilder.toString())
            .setCancelable(!isForced)
            .setPositiveButton("Atualizar Agora") { _, _ ->
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao abrir download: ${e.message}")
                }
                if (isForced) {
                    Handler(Looper.getMainLooper()).postDelayed({
                        (context as? android.app.Activity)?.finishAffinity()
                    }, 1500)
                }
            }

        if (!isForced) {
            builder.setNegativeButton("Depois") { dialog, _ -> dialog.dismiss() }
        }

        val dialog = builder.create()
        dialog.show()

        if (isForced) {
            dialog.setOnCancelListener { showUpdateDialog(context, data, true) }
        }
    }

    // ═══════════════════════════════════════════════════
    //  COMPARAR VERSÕES (semver)
    // ═══════════════════════════════════════════════════
    private fun isNewerVersion(remote: String, local: String): Boolean {
        return try {
            val r = remote.split(".").map { it.toIntOrNull() ?: 0 }
            val l = local.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(r.size, l.size)) {
                val rv = r.getOrElse(i) { 0 }
                val lv = l.getOrElse(i) { 0 }
                if (rv > lv) return true
                if (rv < lv) return false
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao comparar versões: ${e.message}")
            false
        }
    }
}
