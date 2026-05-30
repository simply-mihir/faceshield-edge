package com.faceshieldedge

import com.facebook.react.bridge.*
import kotlin.math.*

/**
 * FaceShieldPreprocessModule — Native image preprocessing pipeline
 *
 * Exposed as NativeModules.FaceShieldPreprocess
 *
 * All operations run in native Kotlin to avoid JS bridge overhead
 * on every camera frame.
 *
 * cropSync(pixels, x, y, w, h)       → cropped RGBA bytes
 * resizeSync(pixels, targetW, targetH)→ bilinear-resized RGBA bytes
 * applyCLAHE(pixels, clipLimit, grid) → CLAHE-enhanced RGBA bytes
 */
class FaceShieldPreprocessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FaceShieldPreprocess"

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun cropSync(pixels: ReadableArray, x: Double, y: Double, w: Double, h: Double): WritableArray {
        // pixels: RGBA flat array, assumed square for simplicity
        val total = pixels.size()
        val side = sqrt(total / 4.0).toInt()

        val x0 = (x * side).toInt().coerceIn(0, side - 1)
        val y0 = (y * side).toInt().coerceIn(0, side - 1)
        val x1 = ((x + w) * side).toInt().coerceIn(0, side)
        val y1 = ((y + h) * side).toInt().coerceIn(0, side)

        val result = Arguments.createArray()
        for (row in y0 until y1) {
            for (col in x0 until x1) {
                val base = (row * side + col) * 4
                if (base + 3 < total) {
                    result.pushInt(pixels.getInt(base))
                    result.pushInt(pixels.getInt(base + 1))
                    result.pushInt(pixels.getInt(base + 2))
                    result.pushInt(pixels.getInt(base + 3))
                }
            }
        }
        return result
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun resizeSync(pixels: ReadableArray, targetW: Int, targetH: Int): WritableArray {
        val total = pixels.size()
        val side = sqrt(total / 4.0).toInt()
        val result = Arguments.createArray()

        val xRatio = side.toDouble() / targetW
        val yRatio = side.toDouble() / targetH

        for (row in 0 until targetH) {
            for (col in 0 until targetW) {
                val srcRow = (row * yRatio).toInt().coerceIn(0, side - 1)
                val srcCol = (col * xRatio).toInt().coerceIn(0, side - 1)
                val base = (srcRow * side + srcCol) * 4
                if (base + 3 < total) {
                    result.pushInt(pixels.getInt(base))
                    result.pushInt(pixels.getInt(base + 1))
                    result.pushInt(pixels.getInt(base + 2))
                    result.pushInt(pixels.getInt(base + 3))
                } else {
                    result.pushInt(0); result.pushInt(0)
                    result.pushInt(0); result.pushInt(255)
                }
            }
        }
        return result
    }

    /**
     * CLAHE — Contrast Limited Adaptive Histogram Equalization
     * clip_limit = 2.0, tile_grid = 8×8 per spec
     * Operates on luminance channel, then recombines with colour.
     */
    @ReactMethod
    fun applyCLAHE(pixels: ReadableArray, clipLimit: Double, tileGrid: Int, promise: Promise) {
        try {
            val size = pixels.size()
            val data = IntArray(size) { pixels.getInt(it) }
            val result = applyCLAHEInternal(data, clipLimit, tileGrid)
            val out = Arguments.createArray()
            result.forEach { out.pushInt(it) }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("CLAHE_ERROR", e.message)
        }
    }

    private fun applyCLAHEInternal(pixels: IntArray, clipLimit: Double, tileGrid: Int): IntArray {
        val pixelCount = pixels.size / 4
        val side = sqrt(pixelCount.toDouble()).toInt()
        val output = pixels.copyOf()

        val tileW = (side + tileGrid - 1) / tileGrid
        val tileH = (side + tileGrid - 1) / tileGrid

        for (tileRow in 0 until tileGrid) {
            for (tileCol in 0 until tileGrid) {
                val x0 = tileCol * tileW
                val y0 = tileRow * tileH
                val x1 = min(x0 + tileW, side)
                val y1 = min(y0 + tileH, side)

                // Build histogram for this tile
                val hist = IntArray(256)
                for (row in y0 until y1) {
                    for (col in x0 until x1) {
                        val base = (row * side + col) * 4
                        if (base + 2 < pixels.size) {
                            val lum = (0.299 * pixels[base] + 0.587 * pixels[base + 1] + 0.114 * pixels[base + 2]).toInt()
                            hist[lum.coerceIn(0, 255)]++
                        }
                    }
                }

                // Clip histogram
                val clipCount = (clipLimit * (x1 - x0) * (y1 - y0) / 256).toInt()
                var excess = 0
                for (i in hist.indices) {
                    if (hist[i] > clipCount) {
                        excess += hist[i] - clipCount
                        hist[i] = clipCount
                    }
                }
                val perBin = excess / 256
                for (i in hist.indices) hist[i] += perBin

                // Build CDF
                val cdf = IntArray(256)
                cdf[0] = hist[0]
                for (i in 1 until 256) cdf[i] = cdf[i - 1] + hist[i]
                val cdfMin = cdf.first { it > 0 }
                val totalPx = (y1 - y0) * (x1 - x0)

                // Apply equalisation to this tile
                for (row in y0 until y1) {
                    for (col in x0 until x1) {
                        val base = (row * side + col) * 4
                        if (base + 2 < output.size) {
                            val lum = (0.299 * pixels[base] + 0.587 * pixels[base + 1] + 0.114 * pixels[base + 2]).toInt().coerceIn(0, 255)
                            val newLum = ((cdf[lum] - cdfMin).toDouble() / (totalPx - cdfMin) * 255).toInt().coerceIn(0, 255)
                            val scale = if (lum == 0) 1.0 else newLum.toDouble() / lum
                            output[base] = (pixels[base] * scale).toInt().coerceIn(0, 255)
                            output[base + 1] = (pixels[base + 1] * scale).toInt().coerceIn(0, 255)
                            output[base + 2] = (pixels[base + 2] * scale).toInt().coerceIn(0, 255)
                        }
                    }
                }
            }
        }
        return output
    }
}
