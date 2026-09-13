package com.wakemeup.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "wake_outcomes")
data class WakeOutcomeEntity(
    @PrimaryKey
    val id: String,
    val wakePlanId: String,
    val alarmTriggeredAt: Long,
    val firstDismissedAt: Long? = null,
    val attemptCount: Int = 1,
    val verifiedAt: Long? = null,
    val verificationMethod: String? = null, // STEPS, QR
    val stepsObserved: Int = 0,
    val qrUsed: Boolean = false,
    val success: Boolean = false
)
