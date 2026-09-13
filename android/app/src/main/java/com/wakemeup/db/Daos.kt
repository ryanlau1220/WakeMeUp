package com.wakemeup.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface WakePlanDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(plan: WakePlanEntity)

    @Update
    suspend fun update(plan: WakePlanEntity)

    @Query("SELECT * FROM wake_plans WHERE id = :id LIMIT 1")
    suspend fun getPlanById(id: String): WakePlanEntity?

    @Query("SELECT * FROM wake_plans WHERE status IN ('APPROVED', 'ALARMING', 'VERIFYING') ORDER BY firstAlarmAt ASC LIMIT 1")
    suspend fun getActivePlan(): WakePlanEntity?

    @Query("SELECT * FROM wake_plans ORDER BY createdAt DESC")
    suspend fun getAllPlans(): List<WakePlanEntity>

    @Query("SELECT * FROM wake_plans WHERE status IN ('APPROVED', 'RETRYING') AND firstAlarmAt > :now")
    suspend fun getFutureScheduledPlans(now: Long): List<WakePlanEntity>

    @Query("UPDATE wake_plans SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)

    @Query("UPDATE wake_plans SET firstAlarmAt = :firstAlarmAt, status = :status WHERE id = :id")
    suspend fun updateScheduledTime(id: String, firstAlarmAt: Long, status: String)
}

@Dao
interface WakeOutcomeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(outcome: WakeOutcomeEntity)

    @Update
    suspend fun update(outcome: WakeOutcomeEntity)

    @Query("SELECT * FROM wake_outcomes WHERE wakePlanId = :planId LIMIT 1")
    suspend fun getOutcomeByPlanId(planId: String): WakeOutcomeEntity?

    @Query("SELECT * FROM wake_outcomes ORDER BY alarmTriggeredAt DESC")
    suspend fun getAllOutcomes(): List<WakeOutcomeEntity>
}

@Dao
interface PlanFeedbackDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(feedback: PlanFeedbackEntity)

    @Query("SELECT * FROM plan_feedbacks ORDER BY createdAt DESC")
    suspend fun getAllFeedbacks(): List<PlanFeedbackEntity>
}
