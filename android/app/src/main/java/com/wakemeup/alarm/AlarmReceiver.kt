package com.wakemeup.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
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
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ALARM_TRIGGER) return

        val planId = intent.getStringExtra(EXTRA_PLAN_ID) ?: return
        val eventTitle = intent.getStringExtra(EXTRA_EVENT_TITLE) ?: "Upcoming Commitment"
        val requiredSteps = intent.getIntExtra(EXTRA_REQUIRED_STEPS, 15)
        val gracePeriodSec = intent.getIntExtra(EXTRA_GRACE_PERIOD_SEC, 180)

        Log.d("AlarmReceiver", "Alarm triggered for plan: $planId ($eventTitle)")

        // Acquire temporary WakeLock to guarantee execution
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "WakeMeUp:AlarmTriggerWakeLock"
        )
        wakeLock.acquire(10 * 1000L) // 10 seconds max

        // Update plan status in Room
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(context)
            db.wakePlanDao().updateStatus(planId, "ALARMING")
        }

        // Notify React Native bridge
        WakeMeUpEventEmitter.sendEvent("ALARM_TRIGGERED", mapOf(
            "planId" to planId,
            "eventTitle" to eventTitle,
            "requiredSteps" to requiredSteps
        ))

        // Launch full-screen AlarmActivity over the lock screen
        val alarmIntent = Intent(context, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_PLAN_ID, planId)
            putExtra(EXTRA_EVENT_TITLE, eventTitle)
            putExtra(EXTRA_REQUIRED_STEPS, requiredSteps)
            putExtra(EXTRA_GRACE_PERIOD_SEC, gracePeriodSec)
        }
        context.startActivity(alarmIntent)
    }
}
