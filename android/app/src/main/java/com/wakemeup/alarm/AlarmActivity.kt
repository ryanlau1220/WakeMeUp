package com.wakemeup.alarm

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.wakemeup.MainActivity
import com.wakemeup.bridge.WakeMeUpEventEmitter
import com.wakemeup.db.AppDatabase
import com.wakemeup.verification.WakeVerificationService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AlarmActivity : Activity() {

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    private var planId: String = ""
    private var eventTitle: String = ""
    private var requiredSteps: Int = 15
    private var gracePeriodSec: Int = 180
    private var retryLimit: Int = 2
    private var attempt: Int = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Turn screen on and show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )

        planId = intent.getStringExtra(AlarmReceiver.EXTRA_PLAN_ID) ?: ""
        eventTitle = intent.getStringExtra(AlarmReceiver.EXTRA_EVENT_TITLE) ?: "Upcoming Commitment"
        requiredSteps = intent.getIntExtra(AlarmReceiver.EXTRA_REQUIRED_STEPS, 15)
        gracePeriodSec = intent.getIntExtra(AlarmReceiver.EXTRA_GRACE_PERIOD_SEC, 180)
        retryLimit = intent.getIntExtra(AlarmReceiver.EXTRA_RETRY_LIMIT, 2)
        attempt = intent.getIntExtra(AlarmReceiver.EXTRA_ATTEMPT, 1)

        AlarmReceiver.cancelAlarmNotification(this)

        buildUi()
        startAlarmAudioAndVibration()
    }

    private fun buildUi() {
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#090D16"))
            setPadding(64, 64, 64, 64)
        }

        val badge = TextView(this).apply {
            text = "⏰ ACTIVE WAKE OBJECTIVE"
            setTextColor(Color.parseColor("#38BDF8"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 32)
        }
        rootLayout.addView(badge)

        val titleView = TextView(this).apply {
            text = eventTitle
            setTextColor(Color.WHITE)
            textSize = 28f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }
        rootLayout.addView(titleView)

        val descView = TextView(this).apply {
            text = "Alarm ringing! Dismiss to begin physical step verification."
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 48)
        }
        rootLayout.addView(descView)

        val stepsInfoView = TextView(this).apply {
            text = "Target: $requiredSteps physical steps"
            setTextColor(Color.parseColor("#F59E0B"))
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 64)
        }
        rootLayout.addView(stepsInfoView)

        val dismissBtn = Button(this).apply {
            text = "DISMISS & START VERIFICATION"
            setTextColor(Color.BLACK)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor("#38BDF8"))
                cornerRadius = 28f
            }
            background = bg
            setPadding(48, 40, 48, 40)
            setOnClickListener {
                onAlarmDismissed()
            }
        }
        rootLayout.addView(dismissBtn)

        setContentView(rootLayout)
    }

    private fun startAlarmAudioAndVibration() {
        try {
            val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@AlarmActivity, alertUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        val pattern = longArrayOf(0, 600, 400, 600, 400)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }
    }

    private fun stopAlarmAudioAndVibration() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
        vibrator?.cancel()
    }

    private fun onAlarmDismissed() {
        stopAlarmAudioAndVibration()

        // Start Foreground WakeVerificationService
        val serviceIntent = Intent(this, WakeVerificationService::class.java).apply {
            putExtra(WakeVerificationService.EXTRA_PLAN_ID, planId)
            putExtra(WakeVerificationService.EXTRA_REQUIRED_STEPS, requiredSteps)
            putExtra(WakeVerificationService.EXTRA_GRACE_PERIOD_SEC, gracePeriodSec)
            putExtra(WakeVerificationService.EXTRA_RETRY_LIMIT, retryLimit)
            putExtra(WakeVerificationService.EXTRA_ATTEMPT, attempt)
        }
        ContextCompat.startForegroundService(this, serviceIntent)

        // Update database
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getDatabase(this@AlarmActivity)
            db.wakePlanDao().updateStatus(planId, "VERIFYING")
        }

        // Notify React Native
        WakeMeUpEventEmitter.sendEvent("ALARM_DISMISSED", mapOf(
            "planId" to planId,
            "requiredSteps" to requiredSteps
        ))

        // Open main app
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        startActivity(mainIntent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAlarmAudioAndVibration()
    }
}
