package com.wakemeup.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "wake_plans")
data class WakePlanEntity(
    @PrimaryKey
    val id: String,
    val calendarEventId: String? = null,
    val eventTitle: String,
    val eventStart: Long,
    val wakeObjectiveAt: Long,
    val firstAlarmAt: Long,
    val requiredSteps: Int = 15,
    val gracePeriodSeconds: Int = 180,
    val retryLimit: Int = 2,
    val qrFallbackEnabled: Boolean = true,
    val status: String = "APPROVED", // DRAFT, APPROVED, ALARMING, VERIFYING, VERIFIED, FAILED, CANCELLED
    val createdAt: Long = System.currentTimeMillis(),
    val approvedAt: Long? = System.currentTimeMillis(),
    val reasoningSummary: String = ""
)
