package com.wakemeup.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "plan_feedbacks")
data class PlanFeedbackEntity(
    @PrimaryKey
    val id: String,
    val wakePlanId: String,
    val decision: String, // APPROVED, ADJUSTED, REJECTED
    val feedback: String,
    val createdAt: Long = System.currentTimeMillis()
)
