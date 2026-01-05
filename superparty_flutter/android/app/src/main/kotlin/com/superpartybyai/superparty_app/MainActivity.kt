package com.superpartybyai.superparty_app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.superpartybyai.superparty_app/apk_installer"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "canInstallPackages" -> {
                    val canInstall = canRequestPackageInstalls()
                    result.success(canInstall)
                }
                "installApk" -> {
                    val filePath = call.argument<String>("filePath")
                    if (filePath != null) {
                        try {
                            installApk(filePath)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("INSTALL_ERROR", e.message, null)
                        }
                    } else {
                        result.error("INVALID_PATH", "APK file path is null", null)
                    }
                }
                "openUnknownSourcesSettings" -> {
                    try {
                        openUnknownSourcesSettings()
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("SETTINGS_ERROR", e.message, null)
                    }
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }

    /**
     * Verifică dacă aplicația poate instala pachete
     * 
     * Pe Android 8.0+ (API 26+) verifică permisiunea REQUEST_INSTALL_PACKAGES
     * Pe versiuni mai vechi returnează true (nu e nevoie de permisiune)
     */
    private fun canRequestPackageInstalls(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            packageManager.canRequestPackageInstalls()
        } else {
            true // Pe versiuni vechi nu e nevoie de permisiune
        }
    }

    /**
     * Instalează APK-ul de la path-ul specificat
     * 
     * Folosește FileProvider pentru Android 7.0+ (API 24+)
     * Pentru versiuni mai vechi folosește Uri.fromFile()
     */
    private fun installApk(filePath: String) {
        val file = File(filePath)
        
        if (!file.exists()) {
            throw Exception("APK file not found: $filePath")
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Android 7.0+ folosește FileProvider
            FileProvider.getUriForFile(
                this,
                "${applicationContext.packageName}.fileprovider",
                file
            )
        } else {
            // Versiuni mai vechi folosesc file:// URI
            Uri.fromFile(file)
        }

        intent.setDataAndType(uri, "application/vnd.android.package-archive")
        
        startActivity(intent)
    }

    /**
     * Deschide Settings pentru permisiunea "Install unknown apps"
     * 
     * Pe Android 8.0+ (API 26+) deschide Settings specific pentru app
     * Pe versiuni mai vechi deschide Security settings general
     */
    private fun openUnknownSourcesSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Android 8.0+ - Settings specific pentru app
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${packageName}")
            }
        } else {
            // Versiuni mai vechi - Security settings general
            Intent(Settings.ACTION_SECURITY_SETTINGS)
        }

        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
    }
}
