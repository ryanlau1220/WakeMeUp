package com.wakemeup.db

import android.content.Context
import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        WakePlanEntity::class,
        WakeOutcomeEntity::class,
        PlanFeedbackEntity::class,
        PendingEscalationEntity::class,
    ],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun wakePlanDao(): WakePlanDao
    abstract fun wakeOutcomeDao(): WakeOutcomeDao
    abstract fun planFeedbackDao(): PlanFeedbackDao
    abstract fun pendingEscalationDao(): PendingEscalationDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE TABLE IF NOT EXISTS pending_escalations (" +
                        "id TEXT NOT NULL, wakePlanId TEXT NOT NULL, planTitle TEXT NOT NULL, " +
                        "message TEXT NOT NULL, attempts INTEGER NOT NULL, status TEXT NOT NULL, " +
                        "createdAt INTEGER NOT NULL, PRIMARY KEY(id))",
                )
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "wake_me_up_db"
                ).addMigrations(MIGRATION_1_2).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
