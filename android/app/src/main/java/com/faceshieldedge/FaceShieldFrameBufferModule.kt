package com.faceshieldedge

import com.facebook.react.bridge.*

/**
 * FaceShieldFrameBufferModule — exposes the native frame buffer to JS
 *
 * JS calls NativeModules.FaceShieldFrameBuffer.getCurrentFrame()
 * which returns the latest RGBA byte array from the frame processor.
 *
 * TFLiteRunner.captureFrame() uses this to grab the current camera frame
 * at inference time without going through the React bridge on every frame.
 */
class FaceShieldFrameBufferModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FaceShieldFrameBuffer"

    @ReactMethod
    fun getCurrentFrame(promise: Promise) {
        val bytes = FaceShieldFrameProcessorPlugin.currentFrameRGBA
        if (bytes == null) {
            promise.reject("NO_FRAME", "No camera frame available yet")
            return
        }
        val result = Arguments.createArray()
        for (b in bytes) {
            result.pushInt(b.toInt() and 0xFF)
        }
        promise.resolve(result)
    }
}
