package com.ontime.alarmaccess

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tells the app whether the OS will fire its preparation alarms on time, and opens the two system
 * screens that decide it: exact-alarm access (Android 12+) and the battery optimization exemption.
 * Nothing here changes state by itself; every change is a decision the person makes on a system
 * screen the app only opens.
 */
class OnTimeAlarmAccessModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private fun canScheduleExactAlarms(): Boolean {
    val context = context ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
    return alarmManager.canScheduleExactAlarms()
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    val context = context ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun startSettings(action: String, withPackageData: Boolean): Boolean {
    val context = context ?: return false
    val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (withPackageData) intent.data = Uri.parse("package:${context.packageName}")
    if (intent.resolveActivity(context.packageManager) == null) return false
    return try {
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OnTimeAlarmAccess")

    Function("canScheduleExactAlarms") { canScheduleExactAlarms() }

    Function("isIgnoringBatteryOptimizations") { isIgnoringBatteryOptimizations() }

    // Android 12+ only: the per-app "Alarms & reminders" switch. Older releases grant it implicitly.
    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      startSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, withPackageData = true)
    }

    // The direct exemption dialog needs REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; when it cannot be
    // shown the system list is the next best door.
    Function("openBatteryOptimizationSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@Function false
      startSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, withPackageData = true)
        || startSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS, withPackageData = false)
    }
  }
}
