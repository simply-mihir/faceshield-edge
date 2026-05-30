package com.faceshieldedge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * FaceShieldPackage — Registers all FaceShield native modules with React Native.
 *
 * Add this to MainApplication.kt:
 *   packages.add(FaceShieldPackage())
 */
class FaceShieldPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(
            FaceShieldCryptoModule(ctx),
            FaceShieldAntiSpoofModule(ctx),
            FaceShieldPreprocessModule(ctx),
        )

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
