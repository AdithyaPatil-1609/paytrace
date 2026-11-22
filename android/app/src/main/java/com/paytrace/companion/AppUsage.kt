package com.paytrace.companion

// Card M3, optional. For the known subscription apps only (KnownApps.kt),
// reads two facts from Android's own usage statistics: the day each app was
// last opened, and its minutes in the last 30 days. Nothing on screen is read,
// and no other app is ever named in a report. The person turns it on in
// Settings > Usage access, and can turn it off there at any time.

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import androidx.compose.runtime.mutableStateOf
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class AppUse(val packageName: String, val merchant: String, val lastUsed: LocalDate?, val minutes30d: Int)

object AppUsage {

    private const val PREFS = "paytrace_usage"
    private const val DAY_MS = 24L * 60 * 60 * 1000
    const val WINDOW_DAYS = 180L
    private const val RESEND_AFTER_MS = 12L * 60 * 60 * 1000

    // Shown on screen.
    val lastResult = mutableStateOf("")
    val access = mutableStateOf(false)
    val found = mutableStateOf<List<AppUse>>(emptyList())

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)
    fun setEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean("enabled", on).apply() }

    fun load(context: Context) {
        lastResult.value = prefs(context).getString("last_result", "") ?: ""
        access.value = hasAccess(context)
    }

    private fun record(context: Context, message: String, sentOk: Boolean) {
        val edit = prefs(context).edit().putString("last_result", message)
        if (sentOk) edit.putLong("last_sent", System.currentTimeMillis())
        edit.apply()
        lastResult.value = message
    }

    // True when the person has switched Paytrace on in Settings > Usage access.
    fun hasAccess(context: Context): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return if (mode == AppOpsManager.MODE_DEFAULT) {
            context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
        } else mode == AppOpsManager.MODE_ALLOWED
    }

    fun settingsIntent() = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)

    private fun installed(context: Context, packageName: String) = try {
        context.packageManager.getPackageInfo(packageName, 0); true
    } catch (e: PackageManager.NameNotFoundException) { false }

    private fun day(ms: Long): LocalDate = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate()

    // Reads the known apps' usage. Returns the apps found and the first day the
    // phone really has statistics for (never earlier than 180 days ago), so a
    // "not opened since" claim is never older than the phone's own records.
    fun read(context: Context, now: Long = System.currentTimeMillis()): Pair<List<AppUse>, LocalDate> {
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val windowStart = now - WINDOW_DAYS * DAY_MS
        val window = manager.queryAndAggregateUsageStats(windowStart, now)
        val month = manager.queryAndAggregateUsageStats(now - 30 * DAY_MS, now)
        val firstData = window.values.map { it.firstTimeStamp }.filter { it > 0 }.minOrNull() ?: now
        val coveredFrom = maxOf(windowStart, firstData)
        val apps = KnownApps.all
            .filter { window.containsKey(it.packageName) || installed(context, it.packageName) }
            .map { app ->
                val last = listOfNotNull(window[app.packageName]?.lastTimeUsed, month[app.packageName]?.lastTimeUsed)
                    .filter { it in coveredFrom..(now + DAY_MS) }
                    .maxOrNull()
                val minutes = ((month[app.packageName]?.totalTimeInForeground ?: 0L) / 60_000L).toInt().coerceIn(0, 30 * 24 * 60)
                AppUse(app.packageName, app.merchant, last?.let(::day), minutes)
            }
        return apps to day(coveredFrom)
    }

    // The report body: {"windowStart": "...", "apps": [{package, merchant, lastUsed, minutes30d}]}
    fun buildBody(apps: List<AppUse>, windowStart: LocalDate): String {
        val list = JSONArray()
        for (app in apps.take(40)) {
            list.put(
                JSONObject()
                    .put("package", app.packageName)
                    .put("merchant", app.merchant)
                    .put("lastUsed", app.lastUsed?.toString() ?: JSONObject.NULL)
                    .put("minutes30d", app.minutes30d)
            )
        }
        return JSONObject().put("windowStart", windowStart.toString()).put("apps", list).toString()
    }

    // Reads and sends on a background thread. force = the "Send now" button.
    fun sendIfDue(context: Context, force: Boolean = false) {
        val appContext = context.applicationContext
        if (!force) {
            if (!enabled(appContext)) return
            val last = prefs(appContext).getLong("last_sent", 0L)
            if (System.currentTimeMillis() - last < RESEND_AFTER_MS) return
        }
        Thread {
            if (!hasAccess(appContext)) { record(appContext, "Not sent: usage access is off", false); return@Thread }
            val (apps, windowStart) = try { read(appContext) } catch (e: Exception) {
                record(appContext, "Not sent: could not read usage (${e.javaClass.simpleName})", false); return@Thread
            }
            found.value = apps
            if (apps.isEmpty()) { record(appContext, "No known subscription apps on this phone", true); return@Thread }
            val error = EventSender.sendUsage(appContext, buildBody(apps, windowStart))
            if (error == null) record(appContext, "Sent usage for ${apps.size} app${if (apps.size == 1) "" else "s"}", true)
            else record(appContext, error, false)
        }.start()
    }
}
