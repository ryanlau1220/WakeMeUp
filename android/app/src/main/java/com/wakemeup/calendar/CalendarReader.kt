package com.wakemeup.calendar

import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

data class CalendarEventItem(
    val id: String,
    val title: String,
    val startMillis: Long,
    val endMillis: Long,
    val isAllDay: Boolean,
    val location: String?,
    val description: String?
) {
    fun toJsonObject(): JSONObject {
        val json = JSONObject()
        json.put("id", id)
        json.put("title", title)
        json.put("startMillis", startMillis)
        json.put("endMillis", endMillis)
        json.put("isAllDay", isAllDay)
        json.put("location", location ?: "")
        json.put("description", description ?: "")
        return json
    }
}

class CalendarReader(private val context: Context) {

    fun hasCalendarPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun getUpcomingEvents(lookaheadHours: Int = 24): List<CalendarEventItem> {
        if (!hasCalendarPermission()) {
            return emptyList()
        }

        val events = mutableListOf<CalendarEventItem>()
        val now = System.currentTimeMillis()
        val endWindow = now + (lookaheadHours.toLong() * 60 * 60 * 1000)

        val builder: Uri.Builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, now)
        ContentUris.appendId(builder, endWindow)

        val projection = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.DESCRIPTION
        )

        try {
            val cursor = context.contentResolver.query(
                builder.build(),
                projection,
                null,
                null,
                "${CalendarContract.Instances.BEGIN} ASC"
            )

            cursor?.use {
                val idIdx = it.getColumnIndex(CalendarContract.Instances.EVENT_ID)
                val titleIdx = it.getColumnIndex(CalendarContract.Instances.TITLE)
                val beginIdx = it.getColumnIndex(CalendarContract.Instances.BEGIN)
                val endIdx = it.getColumnIndex(CalendarContract.Instances.END)
                val allDayIdx = it.getColumnIndex(CalendarContract.Instances.ALL_DAY)
                val locationIdx = it.getColumnIndex(CalendarContract.Instances.EVENT_LOCATION)
                val descIdx = it.getColumnIndex(CalendarContract.Instances.DESCRIPTION)

                while (it.moveToNext()) {
                    val id = if (idIdx >= 0) it.getString(idIdx) ?: "" else ""
                    val title = if (titleIdx >= 0) it.getString(titleIdx) ?: "Untitled Event" else "Untitled Event"
                    val begin = if (beginIdx >= 0) it.getLong(beginIdx) else 0L
                    val end = if (endIdx >= 0) it.getLong(endIdx) else 0L
                    val allDay = if (allDayIdx >= 0) it.getInt(allDayIdx) == 1 else false
                    val location = if (locationIdx >= 0) it.getString(locationIdx) else null
                    val desc = if (descIdx >= 0) it.getString(descIdx) else null

                    events.add(
                        CalendarEventItem(
                            id = id,
                            title = title,
                            startMillis = begin,
                            endMillis = end,
                            isAllDay = allDay,
                            location = location,
                            description = desc
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return events
    }

    fun getUpcomingEventsAsJson(lookaheadHours: Int = 24): String {
        val list = getUpcomingEvents(lookaheadHours)
        val array = JSONArray()
        for (event in list) {
            array.put(event.toJsonObject())
        }
        return array.toString()
    }
}
