package com.wakemeup.bridge

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.TimePickerDialog
import android.net.Uri
import android.provider.Settings
import android.text.format.DateFormat
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.BatteryManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.wakemeup.BuildConfig
import com.wakemeup.alarm.AlarmScheduler
import com.wakemeup.calendar.CalendarReader
import com.wakemeup.db.AppDatabase
import com.wakemeup.db.PlanFeedbackEntity
import com.wakemeup.db.WakeOutcomeEntity
import com.wakemeup.db.WakePlanEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

class WakeMeUpModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val calendarReader = CalendarReader(reactContext)
    private val alarmScheduler = AlarmScheduler(reactContext)
    private val db = AppDatabase.getDatabase(reactContext)
    private val settings = reactContext.getSharedPreferences("wake_me_up_settings", Context.MODE_PRIVATE)

    init {
        WakeMeUpEventEmitter.setReactContext(reactContext)
    }

    override fun getName(): String = "WakeMeUpModule"

    @ReactMethod
    fun getAgentServerUrl(promise: Promise) {
        promise.resolve(BuildConfig.AGENT_SERVER_URL)
    }

    @ReactMethod
    fun pickAlarmTime(hour: Int, minute: Int, promise: Promise) {
        if (hour !in 0..23 || minute !in 0..59) {
            promise.reject("INVALID_TIME", "Choose a valid time.")
            return
        }
        val activity = reactContext.currentActivity ?: run {
            promise.reject("TIME_PICKER_UNAVAILABLE", "Open Wake Me Up before choosing a time.")
            return
        }
        activity.runOnUiThread {
            val dialog = TimePickerDialog(
                activity,
                { _, selectedHour, selectedMinute ->
                    promise.resolve(Arguments.createMap().apply {
                        putInt("hour", selectedHour)
                        putInt("minute", selectedMinute)
                    })
                },
                hour,
                minute,
                DateFormat.is24HourFormat(activity),
            )
            dialog.setOnCancelListener {
                promise.resolve(Arguments.createMap().apply {
                    putInt("hour", hour)
                    putInt("minute", minute)
                })
            }
            dialog.show()
        }
    }

    @ReactMethod
    fun getWakeSettings(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putInt("prepMinutes", settings.getInt("prepMinutes", 25))
            putInt("travelMinutes", settings.getInt("travelMinutes", 30))
            putInt("safetyMargin", settings.getInt("safetyMargin", 10))
            putString("qrCode", settings.getString("qrCode", "WAKEMEUP_BATHROOM_QR"))
            putBoolean("telegramEscalationEnabled", settings.getBoolean("telegramEscalationEnabled", false))
        })
    }

    @ReactMethod
    fun saveWakeSettings(
        prepMinutes: Int,
        travelMinutes: Int,
        safetyMargin: Int,
        qrCode: String,
        telegramEscalationEnabled: Boolean,
        promise: Promise,
    ) {
        val normalizedQrCode = qrCode.trim()
        if (prepMinutes !in 0..180 || travelMinutes !in 0..180 || safetyMargin !in 0..180 ||
            normalizedQrCode.isEmpty() || normalizedQrCode.length > 120) {
            promise.reject("INVALID_SETTINGS", "Use 0-180 minutes and a QR code up to 120 characters.")
            return
        }
        settings.edit()
            .putInt("prepMinutes", prepMinutes)
            .putInt("travelMinutes", travelMinutes)
            .putInt("safetyMargin", safetyMargin)
            .putString("qrCode", normalizedQrCode)
            .putBoolean("telegramEscalationEnabled", telegramEscalationEnabled)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in Event Emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built-in Event Emitter
    }

    @ReactMethod
    fun getUpcomingEvents(lookaheadHours: Int, promise: Promise) {
        try {
            val events = calendarReader.getUpcomingEvents(lookaheadHours)
            val array = Arguments.createArray()
            for (event in events) {
                val map = Arguments.createMap().apply {
                    putString("id", event.id)
                    putString("title", event.title)
                    putDouble("startMillis", event.startMillis.toDouble())
                    putDouble("endMillis", event.endMillis.toDouble())
                    putBoolean("isAllDay", event.isAllDay)
                    putString("location", event.location ?: "")
                    putString("description", event.description ?: "")
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("CALENDAR_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getWakeReadiness(promise: Promise) {
        try {
            val batteryFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = reactContext.registerReceiver(null, batteryFilter)

            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else 100

            val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL

            val sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            val hasStepSensor = stepSensor != null

            val canScheduleExact = alarmScheduler.canScheduleExactAlarms()
            val canUseFullScreenIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                (reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .canUseFullScreenIntent()
            } else {
                true
            }
            val hasCalendarPermission = calendarReader.hasCalendarPermission()

            val map = Arguments.createMap().apply {
                putInt("batteryLevel", batteryPct)
                putBoolean("isCharging", isCharging)
                putBoolean("hasStepSensor", hasStepSensor)
                putBoolean("canScheduleExactAlarm", canScheduleExact)
                putBoolean("canUseFullScreenIntent", canUseFullScreenIntent)
                putBoolean("hasCalendarPermission", hasCalendarPermission)
                putBoolean("isReadyOffline", true)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("READINESS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestExactAlarmPermission(promise: Promise) {
        try {
            if (alarmScheduler.canScheduleExactAlarms()) {
                promise.resolve(true)
                return
            }
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("EXACT_ALARM_PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestFullScreenIntentPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
                (reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .canUseFullScreenIntent()) {
                promise.resolve(true)
                return
            }
            val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("FULL_SCREEN_PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun saveAndSchedulePlan(planData: ReadableMap, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val id = if (planData.hasKey("id")) planData.getString("id")!! else UUID.randomUUID().toString()
                val eventTitle = planData.getString("eventTitle") ?: "Commitment"
                val eventStart = planData.getDouble("eventStart").toLong()
                val wakeObjectiveAt = planData.getDouble("wakeObjectiveAt").toLong()
                val firstAlarmAt = planData.getDouble("firstAlarmAt").toLong()
                val requiredSteps = if (planData.hasKey("requiredSteps")) planData.getInt("requiredSteps") else 15
                val gracePeriodSeconds = if (planData.hasKey("gracePeriodSeconds")) planData.getInt("gracePeriodSeconds") else 180
                val retryLimit = if (planData.hasKey("retryLimit")) planData.getInt("retryLimit") else 2
                val reasoningSummary = if (planData.hasKey("reasoningSummary")) planData.getString("reasoningSummary") ?: "" else ""
                val now = System.currentTimeMillis()
                require(firstAlarmAt > now && firstAlarmAt < wakeObjectiveAt && wakeObjectiveAt < eventStart) {
                    "This wake plan is no longer schedulable. Choose a later commitment and generate it again."
                }
                require(requiredSteps in 1..100 && gracePeriodSeconds in 30..600 && retryLimit in 1..3) {
                    "Wake plan settings are outside safe limits."
                }

                val plan = WakePlanEntity(
                    id = id,
                    calendarEventId = if (planData.hasKey("calendarEventId")) planData.getString("calendarEventId") else null,
                    eventTitle = eventTitle,
                    eventStart = eventStart,
                    wakeObjectiveAt = wakeObjectiveAt,
                    firstAlarmAt = firstAlarmAt,
                    requiredSteps = requiredSteps,
                    gracePeriodSeconds = gracePeriodSeconds,
                    retryLimit = retryLimit,
                    status = "APPROVED",
                    approvedAt = System.currentTimeMillis(),
                    reasoningSummary = reasoningSummary
                )

                db.wakePlanDao().insert(plan)
                alarmScheduler.scheduleWakePlan(plan)

                withContext(Dispatchers.Main) {
                    val res = Arguments.createMap().apply {
                        putString("id", plan.id)
                        putString("status", "APPROVED")
                    }
                    promise.resolve(res)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("SCHEDULE_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun triggerDemoAlarm(delaySeconds: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val now = System.currentTimeMillis()
                val triggerAt = now + (delaySeconds * 1000L)
                val wakeObjectiveAt = triggerAt + (180 * 1000L)

                val demoPlan = WakePlanEntity(
                    id = "demo-" + UUID.randomUUID().toString().take(8),
                    eventTitle = "Demo Mode: Fast-Forward Wake Check",
                    eventStart = now + (30 * 60 * 1000L),
                    wakeObjectiveAt = wakeObjectiveAt,
                    firstAlarmAt = triggerAt,
                    requiredSteps = 15,
                    gracePeriodSeconds = 120,
                    status = "APPROVED",
                    reasoningSummary = "Demo mode compressed wake objective for fast evaluation"
                )

                db.wakePlanDao().insert(demoPlan)
                alarmScheduler.scheduleWakePlan(demoPlan)

                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putString("id", demoPlan.id)
                        putDouble("firstAlarmAt", triggerAt.toDouble())
                        putInt("delaySeconds", delaySeconds)
                    }
                    promise.resolve(map)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("DEMO_ALARM_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun getActivePlan(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val plan = db.wakePlanDao().getActivePlan()
                withContext(Dispatchers.Main) {
                    promise.resolve(plan?.let(::toPlanMap))
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("DB_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun getScheduledPlans(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val plans = db.wakePlanDao().getFutureScheduledPlans(System.currentTimeMillis())
                val result = Arguments.createArray().apply {
                    plans.forEach { pushMap(toPlanMap(it)) }
                }
                withContext(Dispatchers.Main) { promise.resolve(result) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message, e) }
            }
        }
    }

    private fun toPlanMap(plan: WakePlanEntity): WritableMap = Arguments.createMap().apply {
        putString("id", plan.id)
        if (plan.calendarEventId == null) putNull("calendarEventId") else putString("calendarEventId", plan.calendarEventId)
        putString("eventTitle", plan.eventTitle)
        putDouble("eventStart", plan.eventStart.toDouble())
        putDouble("wakeObjectiveAt", plan.wakeObjectiveAt.toDouble())
        putDouble("firstAlarmAt", plan.firstAlarmAt.toDouble())
        putInt("requiredSteps", plan.requiredSteps)
        putInt("gracePeriodSeconds", plan.gracePeriodSeconds)
        putInt("retryLimit", plan.retryLimit)
        putString("status", plan.status)
        putString("reasoningSummary", plan.reasoningSummary)
    }

    @ReactMethod
    fun savePlanFeedback(wakePlanId: String, decision: String, feedback: String, promise: Promise) {
        if (wakePlanId.isBlank() || decision !in setOf("APPROVED", "ADJUSTED", "REJECTED") || feedback.length > 500) {
            promise.reject("INVALID_FEEDBACK", "Invalid plan feedback")
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                db.planFeedbackDao().insert(
                    PlanFeedbackEntity(UUID.randomUUID().toString(), wakePlanId, decision, feedback.trim())
                )
                withContext(Dispatchers.Main) { promise.resolve(null) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("FEEDBACK_ERROR", e.message, e) }
            }
        }
    }

    @ReactMethod
    fun getRecentWakeHistory(limit: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val entries = db.wakeOutcomeDao().getAllOutcomes().take(limit.coerceIn(1, 20))
                val array = Arguments.createArray()
                entries.forEach { outcome ->
                    array.pushMap(Arguments.createMap().apply {
                        putString("wakePlanId", outcome.wakePlanId)
                        putDouble("alarmTriggeredAt", outcome.alarmTriggeredAt.toDouble())
                        if (outcome.verifiedAt != null) putDouble("verifiedAt", outcome.verifiedAt.toDouble()) else putNull("verifiedAt")
                        putInt("attemptCount", outcome.attemptCount)
                        putInt("stepsObserved", outcome.stepsObserved)
                        putString("verificationMethod", outcome.verificationMethod)
                        putBoolean("success", outcome.success)
                    })
                }
                withContext(Dispatchers.Main) { promise.resolve(array) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("HISTORY_ERROR", e.message, e) }
            }
        }
    }

    @ReactMethod
    fun verifyQrCode(scannedCode: String, expectedCode: String, planId: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val matches = completeQrVerification(scannedCode, expectedCode, planId)
                withContext(Dispatchers.Main) {
                    promise.resolve(matches)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("QR_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun scanQrCode(expectedCode: String, planId: String, promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("QR_SCANNER_UNAVAILABLE", "Open Wake Me Up before scanning the QR code.")
            return
        }
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(activity, options).startScan()
            .addOnSuccessListener { barcode ->
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val verified = completeQrVerification(barcode.rawValue ?: "", expectedCode, planId)
                        withContext(Dispatchers.Main) { promise.resolve(verified) }
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { promise.reject("QR_ERROR", e.message, e) }
                    }
                }
            }
            .addOnCanceledListener { promise.resolve(false) }
            .addOnFailureListener { error -> promise.reject("QR_SCANNER_ERROR", error.message, error) }
    }

    private suspend fun completeQrVerification(
        scannedCode: String,
        expectedCode: String,
        planId: String,
    ): Boolean {
        if (planId.isBlank() || scannedCode.trim() != expectedCode.trim()) return false
        alarmScheduler.cancelAlarm(planId)
        reactContext.stopService(Intent(reactContext, com.wakemeup.verification.WakeVerificationService::class.java))
        db.wakePlanDao().updateStatus(planId, "VERIFIED")
        db.wakeOutcomeDao().insert(
            WakeOutcomeEntity(
                id = UUID.randomUUID().toString(),
                wakePlanId = planId,
                alarmTriggeredAt = System.currentTimeMillis() - 60000,
                firstDismissedAt = System.currentTimeMillis() - 30000,
                attemptCount = 1,
                verifiedAt = System.currentTimeMillis(),
                verificationMethod = "QR",
                stepsObserved = 0,
                qrUsed = true,
                success = true
            )
        )
        WakeMeUpEventEmitter.sendEvent("WAKE_VERIFIED", mapOf(
            "planId" to planId,
            "verificationMethod" to "QR"
        ))
        return true
    }

    @ReactMethod
    fun cancelPlan(planId: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                alarmScheduler.cancelAlarm(planId)
                db.wakePlanDao().updateStatus(planId, "CANCELLED")
                withContext(Dispatchers.Main) {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("CANCEL_ERROR", e.message, e)
                }
            }
        }
    }
}
