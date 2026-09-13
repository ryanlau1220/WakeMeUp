package com.wakemeup.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_escalations")
data class PendingEscalationEntity(
    @PrimaryKey val id: String,
    val wakePlanId: String,
    val planTitle: String,
    val message: String,
    val attempts: Int = 0,
    val status: String = "PENDING",
    val createdAt: Long = System.currentTimeMillis(),
)
