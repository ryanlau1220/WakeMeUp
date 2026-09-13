package com.wakemeup.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.wakemeup.bridge.WakeMeUpEventEmitter
import com.wakemeup.db.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ALARM_TRIGGER = "com.wakemeup.ACTION_ALARM_TRIGGER"
        const val EXTRA_PLAN_ID = "extra_plan_id"
        const val EXTRA_EVENT_TITLE = "extra_event_title"
        const val EXTRA_REQUIRED_STEPS = "extra_required_steps"
        const val EXTRA_GRACE_PERIOD_SEC = "extra_grace_period_sec"
        const val EXTRA_RETRY_LIMIT = "extra_retry_limit"
        const val EXTRA_ATTEMPT = "extra_attempt"

        private const val CHANNEL_ID = "wake_alarm_channel"
        private const val NOTIFICATION_ID = 2000

        fun cancelAlarmNotification(context: Context) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ALARM_TRIGGER) return

        val planId = intent.getStringExtra(EXTRA_PLAN_ID) ?: return
        val eventTitle = intent.getStringExtra(EXTRA_EVENT_TITLE) ?: "Upcoming Commitment"
        val requiredSteps = intent.getIntExtra(EXTRA_REQUIRED_STEPS, 15)
        val gracePeriodSec = intent.getIntExtra(EXTRA_GRACE_PERIOD_SEC, 180)
        val retryLimit = intent.getIntExtra(EXTRA_RETRY_LIMIT, 2)
        val attempt = intent.getIntExtra(EXTRA_ATTEMPT, 1)

        Log.d("AlarmReceiver", "Alarm triggered for plan: $planId ($eventTitle)")

        // Acquire temporary WakeLock to guarantee execution
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "WakeMeUp:AlarmTriggerWakeLock"
        )
        wakeLock.acquire(10 * 1000L) // 10 seconds max

        showAlarmNotification(context, planId, eventTitle, requiredSteps, gracePeriodSec, retryLimit, attempt)

        // Keep the broadcast alive until the short Room update completes.
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(context)
            try {
                db.wakePlanDao().updateStatus(planId, "ALARMING")
            } finally {
                pendingResult.finish()
            }
        }

        // Notify React Native bridge
        WakeMeUpEventEmitter.sendEvent("ALARM_TRIGGERED", mapOf(
            "planId" to planId,
            "eventTitle" to eventTitle,
            "requiredSteps" to requiredSteps
        ))

    }

    private fun showAlarmNotification(
        context: Context,
        planId: String,
        eventTitle: String,
        requiredSteps: Int,
        gracePeriodSec: Int,
        retryLimit: Int,
        attempt: Int
    ) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                android.app.NotificationChannel(
                    CHANNEL_ID,
                    "Wake alarms",
                    android.app.NotificationManager.IMPORTANCE_HIGH
                )
            )
        }

        val alarmIntent = Intent(context, AlarmActivity::class.java).apply {
            putExtra(EXTRA_PLAN_ID, planId)
            putExtra(EXTRA_EVENT_TITLE, eventTitle)
            putExtra(EXTRA_REQUIRED_STEPS, requiredSteps)
            putExtra(EXTRA_GRACE_PERIOD_SEC, gracePeriodSec)
            putExtra(EXTRA_RETRY_LIMIT, retryLimit)
            putExtra(EXTRA_ATTEMPT, attempt)
        }
        val fullScreenIntent = android.app.PendingIntent.getActivity(
            context,
            planId.hashCode(),
            alarmIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.wakemeup.R.mipmap.ic_launcher)
            .setContentTitle("Wake Me Up")
            .setContentText(eventTitle)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenIntent, true)
            .build()
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}
