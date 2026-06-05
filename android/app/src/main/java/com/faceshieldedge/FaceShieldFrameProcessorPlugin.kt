package com.faceshieldedge

import android.graphics.ImageFormat
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

/**
 * FaceShieldFrameProcessorPlugin — VisionCamera v3 Frame Processor (Android)
 *
 * Runs on every camera frame (15 fps, set in AttendanceScreen).
 * Converts YUV_420_888 (NV21) → RGBA byte array and stores it in a
 * companion-object buffer that TFLiteRunner reads on each inference call.
 *
 * Architecture: frame processor writes → static buffer → TFLiteRunner reads
 * This avoids passing large pixel arrays across the JS bridge.
 */
class FaceShieldFrameProcessorPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        // Shared RGBA frame buffer — written by this plugin, read by TFLiteRunner
        @Volatile
        var currentFrameRGBA: ByteArray? = null

        @Volatile
        var frameWidth: Int = 0

        @Volatile
        var frameHeight: Int = 0
    }

    override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
        val image = frame.image

        val width  = image.width
        val height = image.height

        // YUV_420_888 plane layout
        val yPlane  = image.planes[0]
        val uPlane  = image.planes[1]
        val vPlane  = image.planes[2]

        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer

        val yRowStride = yPlane.rowStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        val rgba = ByteArray(width * height * 4)

        for (row in 0 until height) {
            for (col in 0 until width) {
                val yIndex = row * yRowStride + col
                val uvRow = row / 2
                val uvCol = col / 2
                val uvIndex = uvRow * uvRowStride + uvCol * uvPixelStride

                val y  = (yBuffer.get(yIndex).toInt() and 0xFF)
                val u  = (uBuffer.get(uvIndex).toInt() and 0xFF) - 128
                val v  = (vBuffer.get(uvIndex).toInt() and 0xFF) - 128

                // YUV → RGB conversion (BT.601)
                var r = y + (1.370705f * v).toInt()
                var g = y - (0.337633f * u).toInt() - (0.698001f * v).toInt()
                var b = y + (1.732446f * u).toInt()

                r = r.coerceIn(0, 255)
                g = g.coerceIn(0, 255)
                b = b.coerceIn(0, 255)

                val pixelIndex = (row * width + col) * 4
                rgba[pixelIndex]     = r.toByte()
                rgba[pixelIndex + 1] = g.toByte()
                rgba[pixelIndex + 2] = b.toByte()
                rgba[pixelIndex + 3] = 0xFF.toByte()
            }
        }

        // Write to shared buffer for TFLiteRunner to read
        currentFrameRGBA = rgba
        frameWidth  = width
        frameHeight = height

        return null
    }
}