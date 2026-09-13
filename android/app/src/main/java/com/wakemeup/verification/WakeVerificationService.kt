package com.wakemeup.verification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.wakemeup.MainActivity
import com.wakemeup.R
import com.wakemeup.alarm.AlarmScheduler
import com.wakemeup.bridge.WakeMeUpEventEmitter
import com.wakemeup.db.AppDatabase
import com.wakemeup.db.PendingEscalationEntity
import com.wakemeup.db.WakeOutcomeEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

class WakeVerificationService : Service() {

    companion object {
        const val EXTRA_PLAN_ID = "extra_plan_id"
        const val EXTRA_REQUIRED_STEPS = "extra_required_steps"
        const val EXTRA_GRACE_PERIOD_SEC = "extra_grace_period_sec"
        const val EXTRA_RETRY_LIMIT = "extra_retry_limit"
        const val EXTRA_ATTEMPT = "extra_attempt"

        const val CHANNEL_ID = "wake_verification_channel"
        const val NOTIFICATION_ID = 2001
        var isServiceRunning = false
            private set
    }

    private var planId: String = ""
    private var requiredSteps: Int = 15
    private var gracePeriodSec: Int = 180
    private var retryLimit: Int = 2
    private var attempt: Int = 1

    private var stepTracker: StepTracker? = null
    private var countDownTimer: CountDownTimer? = null
    private var currentSteps: Int = 0
    private var completed = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        isServiceRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            planId = intent.getStringExtra(EXTRA_PLAN_ID) ?: ""
            requiredSteps = intent.getIntExtra(EXTRA_REQUIRED_STEPS, 15)
            gracePeriodSec = intent.getIntExtra(EXTRA_GRACE_PERIOD_SEC, 180)
            retryLimit = intent.getIntExtra(EXTRA_RETRY_LIMIT, 2)
            attempt = intent.getIntExtra(EXTRA_ATTEMPT, 1)
        }

        startAsForeground()
        startVerification()

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Wake Verification",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Monitors physical step progress after alarm dismissal"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(steps: Int, remainingSeconds: Int): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Wake Verification Active")
            .setContentText("Steps: $steps / $requiredSteps | Time left: ${remainingSeconds}s")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setProgress(requiredSteps, steps, false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    private fun startAsForeground() {
        val notification = buildNotification(0, gracePeriodSec)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            } else {
                0
            }
            startForeground(NOTIFICATION_ID, notification, type)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startVerification() {
        stepTracker = StepTracker(this) { delta ->
            currentSteps = delta
            updateProgress(delta)
        }
        stepTracker?.startTracking()

        countDownTimer = object : CountDownTimer(gracePeriodSec * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val remainingSec = (millisUntilFinished / 1000).toInt()
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, buildNotification(currentSteps, remainingSec))
            }

            override fun onFinish() {
                onVerificationTimeout()
            }
        }.start()
    }

    private fun updateProgress(steps: Int) {
        WakeMeUpEventEmitter.sendEvent("STEP_PROGRESS", mapOf(
            "planId" to planId,
            "steps" to steps,
            "requiredSteps" to requiredSteps
        ))

        if (steps >= requiredSteps) {
            onVerificationSuccess()
        }
    }

    private fun onVerificationSuccess() {
        if (completed) return
        completed = true
        countDownTimer?.cancel()
        stepTracker?.stopTracking()

        Log.d("WakeVerification", "WAKE VERIFIED successfully with $currentSteps steps!")

        // Save outcome to Room
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(this@WakeVerificationService)
            db.wakePlanDao().updateStatus(planId, "VERIFIED")
            db.wakeOutcomeDao().insert(
                WakeOutcomeEntity(
                    id = UUID.randomUUID().toString(),
                    wakePlanId = planId,
                    alarmTriggeredAt = System.currentTimeMillis() - (gracePeriodSec * 1000L),
                    firstDismissedAt = System.currentTimeMillis() - (currentSteps * 1000L),
                    attemptCount = attempt,
                    verifiedAt = System.currentTimeMillis(),
                    verificationMethod = "STEPS",
                    stepsObserved = currentSteps,
                    qrUsed = false,
                    success = true
                )
            )
        }

        WakeMeUpEventEmitter.sendEvent("WAKE_VERIFIED", mapOf(
            "planId" to planId,
            "steps" to currentSteps,
            "verificationMethod" to "STEPS"
        ))

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun onVerificationTimeout() {
        if (completed) return
        completed = true
        stepTracker?.stopTracking()
        Log.w("WakeVerification", "Verification timed out; scheduling deterministic retry when available.")

        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(this@WakeVerificationService)
            db.wakeOutcomeDao().insert(
                WakeOutcomeEntity(
                    id = UUID.randomUUID().toString(),
                    wakePlanId = planId,
                    alarmTriggeredAt = System.currentTimeMillis() - (gracePeriodSec * 1000L),
                    firstDismissedAt = System.currentTimeMillis() - (gracePeriodSec * 1000L),
                    attemptCount = attempt,
                    stepsObserved = currentSteps,
                    success = false
                )
            )

            val plan = db.wakePlanDao().getPlanById(planId)
            var retryScheduled = false
            if (attempt < retryLimit) {
                if (plan != null) {
                    // ponytail: fixed short retry delay; add a user setting only if recovery timing needs tuning.
                    val retryAt = System.currentTimeMillis() + 30_000L
                    db.wakePlanDao().updateScheduledTime(planId, retryAt, "RETRYING")
                    AlarmScheduler(this@WakeVerificationService).scheduleWakePlan(
                        plan.copy(firstAlarmAt = retryAt),
                        attempt + 1
                    )
                    retryScheduled = true
                }
            }
            if (!retryScheduled) {
                db.wakePlanDao().updateStatus(planId, "FAILED")
                val escalationEnabled = getSharedPreferences("wake_me_up_settings", Context.MODE_PRIVATE)
                    .getBoolean("telegramEscalationEnabled", false)
                if (escalationEnabled) {
                    try {
                        db.pendingEscalationDao().insert(
                            PendingEscalationEntity(
                                id = UUID.randomUUID().toString(),
                                wakePlanId = planId,
                                planTitle = plan?.eventTitle ?: "Wake objective",
                                message = "Wake plan $planId remained unverified after all alarm attempts.",
                            ),
                        )
                    } catch (error: Exception) {
                        Log.e("WakeVerification", "Could not queue Telegram escalation", error)
                    }
                }
            }

            WakeMeUpEventEmitter.sendEvent(if (retryScheduled) "RETRYING" else "QR_REQUIRED", mapOf(
                "planId" to planId,
                "stepsObserved" to currentSteps,
                "requiredSteps" to requiredSteps
            ))
            if (!retryScheduled) {
                WakeMeUpEventEmitter.sendEvent("ESCALATED", mapOf(
                    "planId" to planId,
                    "eventTitle" to (plan?.eventTitle ?: "Wake objective")
                ))
            }
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        countDownTimer?.cancel()
        stepTracker?.stopTracking()
    }
}
