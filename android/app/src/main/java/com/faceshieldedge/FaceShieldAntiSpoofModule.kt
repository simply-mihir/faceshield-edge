package com.faceshieldedge

import com.facebook.react.bridge.*
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * FaceShieldAntiSpoofModule — Native anti-spoofing computations
 *
 * Exposed as NativeModules.FaceShieldAntiSpoof
 *
 * All three tier-1 anti-spoofing checks are implemented natively
 * to avoid JS bridge overhead on per-frame analysis.
 *
 * computeMoireScore(pixels)   → Float [0,1] — higher = likely photo/screen
 * computeEntropy(pixels)      → Float — Shannon entropy of pixel distribution
 * computeSpectralRatio(pixels)→ {r, g, b} channel means
 */
class FaceShieldAntiSpoofModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FaceShieldAntiSpoof"

    /**
     * Moiré pattern detection via simplified frequency analysis.
     * A full 2D FFT is approximated by 1D row FFT averages for speed.
     * Returns a score in [0,1] — score > 0.6 indicates a printed photo or screen.
     */
    @ReactMethod
    fun computeMoireScore(pixels: ReadableArray, promise: Promise) {
        try {
            val data = IntArray(pixels.size()) { pixels.getInt(it) }
            val score = moireDetect(data)
            promise.resolve(score)
        } catch (e: Exception) {
            promise.reject("MOIRE_ERROR", e.message)
        }
    }

    /**
     * Shannon entropy of pixel intensity distribution.
     * Static images/loops have very low inter-frame entropy delta.
     */
    @ReactMethod
    fun computeEntropy(pixels: ReadableArray, promise: Promise) {
        try {
            val data = IntArray(pixels.size()) { pixels.getInt(it) }
            val entropy = shannonEntropy(data)
            promise.resolve(entropy)
        } catch (e: Exception) {
            promise.reject("ENTROPY_ERROR", e.message)
        }
    }

    /**
     * RGB channel means for spectral ratio analysis.
     * Screen-illuminated faces have characteristic low R/(G+B) ratio.
     */
    @ReactMethod
    fun computeSpectralRatio(pixels: ReadableArray, promise: Promise) {
        try {
            val data = IntArray(pixels.size()) { pixels.getInt(it) }
            var rSum = 0.0; var gSum = 0.0; var bSum = 0.0
            var count = 0

            // Assume RGBA interleaved
            var i = 0
            while (i < data.size - 3) {
                rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]
                count++; i += 4
            }

            if (count == 0) {
                promise.resolve(Arguments.createMap().apply {
                    putDouble("r", 0.0); putDouble("g", 0.0); putDouble("b", 0.0)
                })
                return
            }

            promise.resolve(Arguments.createMap().apply {
                putDouble("r", rSum / count)
                putDouble("g", gSum / count)
                putDouble("b", bSum / count)
            })
        } catch (e: Exception) {
            promise.reject("SPECTRAL_ERROR", e.message)
        }
    }

    // ── Private implementations ──────────────────────────────

    private fun moireDetect(pixels: IntArray): Double {
        // Convert to grayscale luminance values
        val gray = DoubleArray(pixels.size / 4) { i ->
            val base = i * 4
            0.299 * pixels[base] + 0.587 * pixels[base + 1] + 0.114 * pixels[base + 2]
        }

        // Simple 1-D periodic pattern detector:
        // Compute autocorrelation at short lags — periodic patterns peak sharply
        val n = gray.size.coerceAtMost(256)
        var periodicEnergy = 0.0
        var totalEnergy = 0.0

        for (lag in 2..16) {
            var corr = 0.0
            for (k in 0 until n - lag) {
                corr += gray[k] * gray[k + lag]
            }
            periodicEnergy += abs(corr)
        }

        for (k in 0 until n) {
            totalEnergy += gray[k] * gray[k]
        }

        return if (totalEnergy == 0.0) 0.0
        else (periodicEnergy / totalEnergy).coerceIn(0.0, 1.0)
    }

    private fun shannonEntropy(pixels: IntArray): Double {
        val histogram = IntArray(256)
        var count = 0
        var i = 0
        while (i < pixels.size - 3) {
            val lum = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]).toInt()
                .coerceIn(0, 255)
            histogram[lum]++
            count++; i += 4
        }
        if (count == 0) return 0.0

        var entropy = 0.0
        for (freq in histogram) {
            if (freq > 0) {
                val p = freq.toDouble() / count
                entropy -= p * ln(p)
            }
        }
        return entropy
    }
}
