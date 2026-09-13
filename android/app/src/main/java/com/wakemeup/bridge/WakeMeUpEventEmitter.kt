package com.wakemeup.bridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object WakeMeUpEventEmitter {
    private var reactContext: ReactContext? = null

    fun setReactContext(context: ReactContext) {
        reactContext = context
    }

    fun sendEvent(eventName: String, params: Map<String, Any?>) {
        val context = reactContext ?: return
        if (!context.hasActiveReactInstance()) return

        val writableMap = Arguments.createMap()
        for ((key, value) in params) {
            when (value) {
                is String -> writableMap.putString(key, value)
                is Int -> writableMap.putInt(key, value)
                is Long -> writableMap.putDouble(key, value.toDouble())
                is Double -> writableMap.putDouble(key, value)
                is Boolean -> writableMap.putBoolean(key, value)
                null -> writableMap.putNull(key)
            }
        }

        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, writableMap)
    }
}
