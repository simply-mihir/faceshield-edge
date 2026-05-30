/**
 * PermissionsScreen — Camera permission gate
 *
 * Shown on first launch before the camera is used.
 * Uses VisionCamera's built-in permission API.
 * Once granted, navigates to Home automatically.
 */
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Camera, CameraPermissionStatus} from 'react-native-vision-camera';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Permissions'>;
};

export function PermissionsScreen({navigation}: Props): React.JSX.Element {
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionStatus>('not-determined');

  useEffect(() => {
    Camera.getCameraPermissionStatus().then(setCameraPermission);
  }, []);

  useEffect(() => {
    if (cameraPermission === 'granted') {
      navigation.replace('Home');
    }
  }, [cameraPermission, navigation]);

  const requestPermission = async () => {
    const status = await Camera.requestCameraPermission();
    setCameraPermission(status);
    if (status === 'denied') {
      // Guide user to Settings
      Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>Camera Access Required</Text>
        <Text style={styles.body}>
          FaceShield Edge needs your front camera to verify attendance via
          facial recognition and liveness detection.{'\n\n'}
          No photos are stored — only encrypted mathematical embeddings.
        </Text>

        {cameraPermission === 'denied' ? (
          <>
            <Text style={styles.denied}>
              Camera permission was denied. Please enable it in Settings.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => Linking.openSettings()}>
              <Text style={styles.btnText}>Open Settings</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Allow Camera Access</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          {Platform.OS === 'android' ? 'Android 8.0+' : 'iOS 12+'} · AES-256 encrypted · Fully offline
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0f0f23'},
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  icon: {fontSize: 64},
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  denied: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  btnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  footnote: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
    marginTop: 16,
  },
});
