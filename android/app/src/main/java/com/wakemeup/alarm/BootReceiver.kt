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

        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(context)
            val activePlan = db.wakePlanDao().getActivePlan()
            if (activePlan != null && activePlan.firstAlarmAt > System.currentTimeMillis()) {
                val scheduler = AlarmScheduler(context)
                scheduler.scheduleWakePlan(activePlan)
            }
        }
    }
}
