package com.wakemeup.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.wakemeup.MainActivity
import com.wakemeup.db.WakePlanEntity

class AlarmScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    fun canScheduleExactAlarms(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
    }

    fun scheduleWakePlan(plan: WakePlanEntity, attempt: Int = 1) {
        check(canScheduleExactAlarms()) {
            "Exact alarms are not permitted. Grant Alarms & reminders access before scheduling."
        }
        val triggerTime = plan.firstAlarmAt
        val now = System.currentTimeMillis()

        Log.d("AlarmScheduler", "Scheduling alarm for plan ${plan.id} at $triggerTime (in ${(triggerTime - now) / 1000}s)")

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_ALARM_TRIGGER
            putExtra(AlarmReceiver.EXTRA_PLAN_ID, plan.id)
            putExtra(AlarmReceiver.EXTRA_EVENT_TITLE, plan.eventTitle)
            putExtra(AlarmReceiver.EXTRA_REQUIRED_STEPS, plan.requiredSteps)
            putExtra(AlarmReceiver.EXTRA_GRACE_PERIOD_SEC, plan.gracePeriodSeconds)
            putExtra(AlarmReceiver.EXTRA_RETRY_LIMIT, plan.retryLimit)
            putExtra(AlarmReceiver.EXTRA_ATTEMPT, attempt)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            plan.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Show Intent for AlarmClockInfo (tapping alarm in system status bar opens app)
        val showIntent = Intent(context, MainActivity::class.java)
        val showPendingIntent = PendingIntent.getActivity(
            context,
            plan.id.hashCode() + 1,
            showIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerTime, showPendingIntent)
        alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
    }

    fun cancelAlarm(planId: String) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_ALARM_TRIGGER
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            planId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }
}
