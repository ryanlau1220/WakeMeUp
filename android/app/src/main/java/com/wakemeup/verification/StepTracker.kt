package com.wakemeup.verification

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log

class StepTracker(
    private val context: Context,
    private val onStepDeltaUpdate: (delta: Int) -> Unit
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    private var baselineSteps: Int? = null
    private var currentDelta: Int = 0
    private var isTracking: Boolean = false

    fun isSensorAvailable(): Boolean {
        return stepCounterSensor != null
    }

    fun startTracking() {
        if (isTracking) return
        baselineSteps = null
        currentDelta = 0
        isTracking = true

        if (stepCounterSensor != null) {
            sensorManager.registerListener(
                this,
                stepCounterSensor,
                SensorManager.SENSOR_DELAY_FASTEST
            )
            Log.d("StepTracker", "Registered TYPE_STEP_COUNTER listener")
        } else {
            Log.w("StepTracker", "TYPE_STEP_COUNTER not available on this device")
        }
    }

    fun stopTracking() {
        if (!isTracking) return
        isTracking = false
        sensorManager.unregisterListener(this)
        Log.d("StepTracker", "Unregistered TYPE_STEP_COUNTER listener")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return

        val rawSteps = event.values[0].toInt()
        if (baselineSteps == null) {
            baselineSteps = rawSteps
            Log.d("StepTracker", "Baseline steps recorded: $rawSteps")
        }

        val delta = rawSteps - (baselineSteps ?: rawSteps)
        if (delta >= 0) {
            currentDelta = delta
            onStepDeltaUpdate(delta)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // Simulated / manual step injection for demo / testing
    fun injectStep() {
        currentDelta += 1
        onStepDeltaUpdate(currentDelta)
    }

    fun getCurrentDelta(): Int = currentDelta
}
