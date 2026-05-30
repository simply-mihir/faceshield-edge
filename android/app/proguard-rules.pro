# FaceShield Edge ProGuard Rules

# ── TensorFlow Lite ────────────────────────────────────────────
-keep class org.tensorflow.** { *; }
-keep class org.tensorflow.lite.** { *; }
-keepclassmembers class org.tensorflow.lite.** { *; }
-dontwarn org.tensorflow.**

# ── FaceShield Native Modules ─────────────────────────────────
-keep class com.faceshieldedge.** { *; }

# ── React Native ──────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.**

# ── VisionCamera ──────────────────────────────────────────────
-keep class com.mrousavy.camera.** { *; }
-dontwarn com.mrousavy.camera.**

# ── MMKV ──────────────────────────────────────────────────────
-keep class com.tencent.mmkv.** { *; }
