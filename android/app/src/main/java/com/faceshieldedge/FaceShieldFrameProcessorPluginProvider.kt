package com.faceshieldedge

import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

/**
 * Registers FaceShieldFrameProcessorPlugin with VisionCamera's plugin registry.
 *
 * Add to MainApplication.kt onCreate():
 *   FaceShieldFrameProcessorPluginProvider.register()
 */
object FaceShieldFrameProcessorPluginProvider {
    fun register() {
        FrameProcessorPluginRegistry.addFrameProcessorPlugin("faceShieldProcessFrame") { proxy, options ->
            FaceShieldFrameProcessorPlugin(proxy, options)
        }
    }
}
