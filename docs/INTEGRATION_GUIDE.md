# FaceShield Edge — Datalake 3.0 Integration Guide

How to integrate FaceShield Edge into an existing Datalake 3.0 React Native application.

---

## Overview

FaceShield Edge is designed as a self-contained feature module. Integration requires:

1. Installing native dependencies
2. Copying source modules into your app
3. Registering native packages (Android) and pods (iOS)
4. Wiring the attendance screen into your navigation stack
5. Initialising storage on app boot

---

## 1. Install Dependencies

Add to your Datalake 3.0 `package.json`:

```bash
npm install \
  react-native-vision-camera@^3.9.1 \
  react-native-fast-tflite@^1.5.0 \
  react-native-mmkv@^2.12.2 \
  react-native-keychain@^8.2.0 \
  @react-native-community/netinfo@^11.3.1 \
  zustand@^4.5.2
```

---

## 2. Copy Source Files

Copy the following directories from FaceShield Edge into your Datalake 3.0 app:

```
src/hooks/useFaceShield.ts
src/hooks/useFaceShieldEnrollment.ts
src/hooks/useSyncStatus.ts
src/modules/TFLiteRunner.ts
src/modules/CameraFrameProcessor.ts
src/modules/AntiSpoofing.ts
src/services/StorageInit.ts
src/services/SyncService.ts
src/services/AttendanceQueue.ts
src/utils/LivenessEngine.ts
src/utils/CosineSimilarity.ts
src/screens/AttendanceScreen.tsx
src/screens/EnrollmentScreen.tsx
src/screens/AdminScreen.tsx
src/types/index.ts          ← merge with your existing types
src/store/attendanceStore.ts ← merge with your Zustand root store
assets/models/              ← all three .tflite files
```

---

## 3. Configure Metro

In your `metro.config.js`, add TFLite extensions so Metro bundles the model files:

```js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  resolver: {
    assetExts: [
      ...getDefaultConfig(__dirname).resolver.assetExts,
      'tflite', 'task', 'lite', 'bin',
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

---

## 4. Android Setup

### 4a. Register native package

In `android/app/src/main/java/<your.package>/MainApplication.kt`:

```kotlin
import com.faceshieldedge.FaceShieldPackage
import com.faceshieldedge.FaceShieldFrameProcessorPluginProvider

// In getPackages():
packages.add(FaceShieldPackage())

// In onCreate():
FaceShieldFrameProcessorPluginProvider.register()
```

### 4b. Copy Kotlin files

Copy all Kotlin files from `android/app/src/main/java/com/faceshieldedge/` into an equivalent package in your app. Adjust the package name at the top of each file to match your app's package.

### 4c. Update build.gradle

In `android/app/build.gradle`:

```groovy
android {
    defaultConfig {
        minSdkVersion 26   // Required for NNAPI + Keystore features
    }
}

dependencies {
    implementation 'org.tensorflow:tensorflow-lite:2.14.0'
    implementation 'org.tensorflow:tensorflow-lite-gpu:2.14.0'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'
    implementation 'org.tensorflow:tensorflow-lite-gpu-delegate-plugin:0.4.4'
}

android {
    aaptOptions {
        noCompress "tflite", "task", "lite", "bin"
    }
}
```

### 4d. AndroidManifest.xml

Ensure these permissions are declared:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-feature android:name="android.hardware.camera.front" android:required="false" />
```

---

## 5. iOS Setup

### 5a. Copy Objective-C++ files

Copy all `.mm` files from `ios/faceshieldedge/` into your iOS target in Xcode. Set each file's type to "Objective-C++ Source" in File Inspector if Xcode doesn't detect it automatically.

### 5b. Podfile

Add to your `ios/Podfile`:

```ruby
pod 'TensorFlowLiteSwift', '~> 2.14.0', :subspecs => ['CoreML', 'Metal']
```

Then run:

```bash
npx pod-install
```

### 5c. Info.plist

Add camera permission:

```xml
<key>NSCameraUsageDescription</key>
<string>FaceShield requires camera access for facial recognition attendance.</string>
```

### 5d. Add models to Xcode bundle

In Xcode, drag the `assets/models/*.tflite` files into your target. In the "Add to targets" dialog, check your app target. Verify they appear in Build Phases → Copy Bundle Resources.

---

## 6. App Initialisation

In your `index.js` (before `AppRegistry.registerComponent`):

```js
import {initStorage} from './src/services/StorageInit';

async function boot() {
  await initStorage();   // must complete before any MMKV reads
  AppRegistry.registerComponent(appName, () => App);
}
boot();
```

In your root `App.tsx`, start the sync listener:

```tsx
import {SyncService} from './src/services/SyncService';

useEffect(() => {
  SyncService.getInstance().startListening();
  return () => SyncService.getInstance().stopListening();
}, []);
```

---

## 7. Navigation Integration

Add FaceShield screens to your existing React Navigation stack:

```tsx
import {AttendanceScreen} from './src/screens/AttendanceScreen';
import {EnrollmentScreen} from './src/screens/EnrollmentScreen';
import {AdminScreen}      from './src/screens/AdminScreen';

// Inside your Stack.Navigator:
<Stack.Screen name="Attendance"  component={AttendanceScreen} />
<Stack.Screen name="Enrollment"  component={EnrollmentScreen} />
<Stack.Screen name="AdminConfig" component={AdminScreen} />
```

Navigate from your existing home/dashboard screen:

```tsx
// Clock-in button
<Button onPress={() => navigation.navigate('Attendance')} title="Clock In" />

// Enroll new employee (admin only)
<Button onPress={() => navigation.navigate('Enrollment')} title="Enroll Employee" />
```

---

## 8. Environment Variables

Add to your `.env`:

```
AWS_API_ENDPOINT=https://your-api-id.execute-api.ap-south-1.amazonaws.com/prod
AWS_REGION=ap-south-1
LOCATION_TAG=SITE-001
DEVICE_SECRET=your-64-char-hex-secret
```

`DEVICE_SECRET` is used in SHA-256 tamper hashing. Use a unique value per device, stored securely and never committed to git.

---

## 9. AWS Backend

Deploy the SAM stack from the `aws/` directory:

```bash
cd aws/
sam build
sam deploy --guided \
  --stack-name faceshield-edge \
  --region ap-south-1 \
  --capabilities CAPABILITY_IAM
```

After deployment, copy the `ApiEndpoint` output value to `AWS_API_ENDPOINT` in your `.env`.

---

## 10. Verify Integration

Run the test suite to confirm all modules are wired correctly:

```bash
npm test
```

Expected: 19 tests passing across CosineSimilarity, LivenessEngine, AttendanceQueue.

For a manual smoke test on device:
1. Grant camera permission on first launch
2. Navigate to Enrollment → enroll an employee with 5 face captures
3. Navigate to Attendance → complete one liveness challenge
4. Check MMKV queue via AdminScreen → should show 1 pending record
5. Enable WiFi → record should sync and queue should clear

---

## Zustand Store Integration

If your Datalake 3.0 app uses a root Zustand store, merge `attendanceStore` into it:

```ts
// src/store/index.ts
import {create} from 'zustand';
import {createAttendanceSlice} from './attendanceStore';
import {createYourExistingSlice} from './yourStore';

export const useStore = create((...args) => ({
  ...createYourExistingSlice(...args),
  ...createAttendanceSlice(...args),
}));
```

---

## Troubleshooting

**"Native module FaceShieldCrypto is null"**
→ Ensure `FaceShieldPackage` is registered in `MainApplication.kt` and the app was rebuilt (`npx react-native run-android`).

**"initStorage must be called before using storage"**
→ `initStorage()` is not being awaited before `AppRegistry.registerComponent`. See Step 6.

**TFLite models not found**
→ Verify `.tflite` files are in `assets/models/`, metro.config.js includes `tflite` in `assetExts`, and on iOS the files appear in Xcode Copy Bundle Resources.

**Camera shows black screen on Android**
→ Ensure `minSdkVersion` is 26+. Camera2 API (required by VisionCamera v3) needs API 21, but NNAPI delegate needs 26.

**Sync never fires**
→ Check that `SyncService.getInstance().startListening()` is called in `App.tsx` and that `AWS_API_ENDPOINT` is set correctly in `.env`.
