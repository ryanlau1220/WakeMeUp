package com.wakemeup.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        WakePlanEntity::class,
        WakeOutcomeEntity::class,
        PlanFeedbackEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun wakePlanDao(): WakePlanDao
    abstract fun wakeOutcomeDao(): WakeOutcomeDao
    abstract fun planFeedbackDao(): PlanFeedbackDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "wake_me_up_db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
