/**
 * AttendanceScreen — Primary attendance verification screen
 *
 * Integrates useFaceShield() hook.
 * Renders camera feed, challenge prompt, auth status, and result banner.
 *
 * This is the screen Datalake 3.0 drops into the existing navigation stack.
 * No changes to navigation, Zustand store, or backend are required.
 */
import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Vibration,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Camera, useCameraDevice, useFrameProcessor} from 'react-native-vision-camera';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {useFaceShield} from '../hooks/useFaceShield';
import {AttendanceRecord, AuthStatus, ChallengeStatus, LivenessChallenge} from '../types';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Attendance'>;
  route: RouteProp<RootStackParamList, 'Attendance'>;
};

const CHALLENGE_LABELS: Record<LivenessChallenge, string> = {
  blink: '👁️  Please blink once',
  smile: '😊  Smile naturally',
  head_left: '⬅️  Turn your head slightly left',
  head_right: '➡️  Turn your head slightly right',
  brow_raise: '⬆️  Raise your eyebrows',
};

const STATUS_COLORS: Record<AuthStatus, string> = {
  idle: '#94a3b8',
  processing: '#f59e0b',
  success: '#22c55e',
  rejected: '#ef4444',
  spoofing_detected: '#ef4444',
  timeout: '#ef4444',
};

const STATUS_LABELS: Record<AuthStatus, string> = {
  idle: 'Ready to verify',
  processing: 'Verifying identity…',
  success: '✅ Authenticated',
  rejected: '❌ Not recognised',
  spoofing_detected: '🚫 Spoofing detected',
  timeout: '⏱ Session timed out',
};

export function AttendanceScreen({navigation, route}: Props): React.JSX.Element {
  const {employeeId} = route.params;
  const device = useCameraDevice('front');

  const {
    challenge,
    challengeStatus,
    authStatus,
    startAuth,
    reset,
    isReady,
  } = useFaceShield({
    employeeId,
    onSuccess: (record: AttendanceRecord) => {
      Vibration.vibrate(200);
      Alert.alert(
        'Attendance Recorded',
        `Verified as ${record.name}\n${new Date(record.timestamp).toLocaleTimeString('en-IN')}`,
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    },
    onFailure: reason => {
      Vibration.vibrate([0, 100, 100, 100]);
      const messages: Record<string, string> = {
        spoof: 'Spoofing attempt detected. Please use your real face.',
        liveness_fail: 'Liveness check failed. Please try again.',
        no_match: 'Face not recognised. Please retry.',
        timeout: 'Session timed out. Please retry.',
        no_face: 'No face detected. Please position your face in the frame.',
        multi_face: 'Multiple faces detected. Please ensure only one face is visible.',
      };
      Alert.alert('Verification Failed', messages[reason] ?? 'Unknown error');
    },
  });

  if (!device) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.errorText}>Front camera not available</Text>
      </SafeAreaView>
    );
  }

  const challengeLabel = challenge ? CHALLENGE_LABELS[challenge] : '';
  const challengeColor: Record<ChallengeStatus, string> = {
    waiting: '#f59e0b',
    detected: '#22c55e',
    failed: '#ef4444',
    expired: '#94a3b8',
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Camera feed */}
      <View style={styles.cameraContainer}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={false}
          video={false}
        />
        {/* Face guide oval */}
        <View style={styles.faceGuide} />
      </View>

      {/* Challenge prompt */}
      {challenge && authStatus === 'processing' && (
        <View style={[styles.challengeBox, {borderColor: challengeColor[challengeStatus]}]}>
          <Text style={styles.challengeText}>{challengeLabel}</Text>
          <View style={[styles.challengeDot, {backgroundColor: challengeColor[challengeStatus]}]} />
        </View>
      )}

      {/* Auth status banner */}
      <View style={[styles.statusBanner, {backgroundColor: STATUS_COLORS[authStatus] + '22'}]}>
        <Text style={[styles.statusText, {color: STATUS_COLORS[authStatus]}]}>
          {STATUS_LABELS[authStatus]}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {authStatus === 'idle' || authStatus === 'rejected' || authStatus === 'timeout' ? (
          <TouchableOpacity
            style={[styles.btn, !isReady && styles.btnDisabled]}
            onPress={startAuth}
            disabled={!isReady}>
            <Text style={styles.btnText}>
              {isReady ? 'Verify Attendance' : 'Loading Models…'}
            </Text>
          </TouchableOpacity>
        ) : authStatus === 'processing' ? (
          <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={reset}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}

        {(authStatus === 'rejected' || authStatus === 'spoofing_detected') && (
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0f0f23'},
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 0,
  },
  faceGuide: {
    position: 'absolute',
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    alignSelf: 'center',
    top: '50%',
    marginTop: -140,
  },
  challengeBox: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#1e1e3a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challengeText: {fontSize: 16, color: '#ffffff', fontWeight: '600'},
  challengeDot: {width: 12, height: 12, borderRadius: 6},
  statusBanner: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  statusText: {fontSize: 15, fontWeight: '700'},
  actions: {padding: 20, gap: 12},
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {backgroundColor: '#374151'},
  btnCancel: {backgroundColor: '#6b7280'},
  btnSecondary: {backgroundColor: '#1e1e3a', borderWidth: 1, borderColor: '#3b82f6'},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  errorText: {color: '#ef4444', textAlign: 'center', marginTop: 40, fontSize: 16},
});
