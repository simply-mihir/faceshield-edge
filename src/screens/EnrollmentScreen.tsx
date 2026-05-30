/**
 * EnrollmentScreen — 5-image face enrollment for new employees
 *
 * Fully offline — works in airplane mode.
 * Embeddings stored encrypted in MMKV with syncStatus: "pending_enrollment".
 * Synced to DynamoDB automatically when connectivity returns.
 */
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useFaceShieldEnrollment, CAPTURE_PROMPTS} from '../hooks/useFaceShieldEnrollment';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Enrollment'>;
};

export function EnrollmentScreen({navigation}: Props): React.JSX.Element {
  const device = useCameraDevice('front');
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');

  const {
    captureProgress,
    enrollmentStatus,
    startEnrollment,
    captureNext,
    reset,
  } = useFaceShieldEnrollment({
    onComplete: (empId, syncStatus) => {
      Alert.alert(
        'Enrollment Complete',
        `${empId} enrolled successfully.\nSync: ${syncStatus === 'synced' ? '✅ Uploaded' : '⏳ Pending (will sync when online)'}`,
        [{text: 'Done', onPress: () => { reset(); navigation.goBack(); }}],
      );
    },
    onError: msg => Alert.alert('Capture Error', msg),
  });

  const handleStart = () => {
    if (!employeeId.trim() || !name.trim()) {
      Alert.alert('Required', 'Please enter Employee ID and Name');
      return;
    }
    startEnrollment(employeeId.trim().toUpperCase(), name.trim());
  };

  const currentPrompt = CAPTURE_PROMPTS[captureProgress] ?? '';
  const isCapturing = enrollmentStatus === 'capturing';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Camera */}
        <View style={styles.cameraWrap}>
          {device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={isCapturing}
              photo={false}
              video={false}
            />
          ) : (
            <Text style={styles.noCam}>Camera unavailable</Text>
          )}
          {isCapturing && <View style={styles.faceGuide} />}
        </View>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {[0, 1, 2, 3, 4].map(i => (
            <View
              key={i}
              style={[
                styles.progressDot,
                {backgroundColor: i < captureProgress ? '#22c55e' : i === captureProgress ? '#f59e0b' : '#374151'},
              ]}
            />
          ))}
        </View>
        <Text style={styles.progressLabel}>{captureProgress}/5 images captured</Text>

        {/* Form — only show before enrollment starts */}
        {enrollmentStatus === 'idle' && (
          <View style={styles.form}>
            <Text style={styles.label}>Employee ID</Text>
            <TextInput
              style={styles.input}
              value={employeeId}
              onChangeText={setEmployeeId}
              placeholder="e.g. EMP001"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
            />
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ravi Kumar"
              placeholderTextColor="#64748b"
            />
            <TouchableOpacity style={styles.btn} onPress={handleStart}>
              <Text style={styles.btnText}>Start Enrollment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Capture prompt */}
        {isCapturing && (
          <View style={styles.promptBox}>
            <Text style={styles.promptLabel}>Pose {captureProgress + 1} of 5</Text>
            <Text style={styles.promptText}>{currentPrompt}</Text>
            <TouchableOpacity style={styles.captureBtn} onPress={captureNext}>
              <Text style={styles.captureBtnText}>📸  Capture</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Processing state */}
        {enrollmentStatus === 'processing' && (
          <View style={styles.processingBox}>
            <Text style={styles.processingText}>⚙️  Generating embeddings…</Text>
            <Text style={styles.processingSubText}>This may take a few seconds</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0f0f23'},
  container: {padding: 20, gap: 16},
  cameraWrap: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1e1e3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noCam: {color: '#64748b'},
  faceGuide: {
    position: 'absolute',
    width: 180,
    height: 240,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  progressRow: {flexDirection: 'row', justifyContent: 'center', gap: 12},
  progressDot: {width: 16, height: 16, borderRadius: 8},
  progressLabel: {textAlign: 'center', color: '#94a3b8', fontSize: 13},
  form: {gap: 12},
  label: {color: '#94a3b8', fontSize: 13, marginBottom: -4},
  input: {
    backgroundColor: '#1e1e3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  btn: {backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, alignItems: 'center'},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  promptBox: {
    backgroundColor: '#1e1e3a',
    borderRadius: 14,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  promptLabel: {color: '#f59e0b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1},
  promptText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  captureBtn: {backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  captureBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  processingBox: {
    backgroundColor: '#1e1e3a',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  processingText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  processingSubText: {color: '#64748b', fontSize: 13},
});
