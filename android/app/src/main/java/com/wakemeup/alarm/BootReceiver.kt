package com.wakemeup.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.wakemeup.db.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = AppDatabase.getDatabase(context)
                val scheduler = AlarmScheduler(context)
                db.wakePlanDao().getFutureScheduledPlans(System.currentTimeMillis())
                    .forEach(scheduler::scheduleWakePlan)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
