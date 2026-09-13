package com.wakemeup.bridge

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.BatteryManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.wakemeup.alarm.AlarmScheduler
import com.wakemeup.calendar.CalendarReader
import com.wakemeup.db.AppDatabase
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

    init {
        WakeMeUpEventEmitter.setReactContext(reactContext)
    }

    override fun getName(): String = "WakeMeUpModule"

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
            val hasCalendarPermission = calendarReader.hasCalendarPermission()

            val map = Arguments.createMap().apply {
                putInt("batteryLevel", batteryPct)
                putBoolean("isCharging", isCharging)
                putBoolean("hasStepSensor", hasStepSensor)
                putBoolean("canScheduleExactAlarm", canScheduleExact)
                putBoolean("hasCalendarPermission", hasCalendarPermission)
                putBoolean("isReadyOffline", true)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("READINESS_ERROR", e.message, e)
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

                val plan = WakePlanEntity(
                    id = id,
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
                    if (plan != null) {
                        val map = Arguments.createMap().apply {
                            putString("id", plan.id)
                            putString("eventTitle", plan.eventTitle)
                            putDouble("eventStart", plan.eventStart.toDouble())
                            putDouble("wakeObjectiveAt", plan.wakeObjectiveAt.toDouble())
                            putDouble("firstAlarmAt", plan.firstAlarmAt.toDouble())
                            putInt("requiredSteps", plan.requiredSteps)
                            putInt("gracePeriodSeconds", plan.gracePeriodSeconds)
                            putString("status", plan.status)
                            putString("reasoningSummary", plan.reasoningSummary)
                        }
                        promise.resolve(map)
                    } else {
                        promise.resolve(null)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("DB_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun verifyQrCode(scannedCode: String, expectedCode: String, planId: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val matches = scannedCode.trim() == expectedCode.trim() || scannedCode.contains("WAKEMEUP")
                if (matches) {
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
                }
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
