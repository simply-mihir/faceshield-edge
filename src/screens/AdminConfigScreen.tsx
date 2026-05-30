/**
 * AdminConfigScreen — Admin-configurable parameters panel
 *
 * All changes persist immediately to MMKV via ConfigStore.
 * Exposes the 6 configurable parameters from the spec.
 */
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ConfigStore} from '../services/ConfigStore';
import {FaceShieldConfig, DEFAULT_CONFIG} from '../types';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminConfig'>;
};

export function AdminConfigScreen({navigation}: Props): React.JSX.Element {
  const current = ConfigStore.getConfig();

  const [threshold, setThreshold] = useState(String(current.similarityThreshold));
  const [livenessTimeout, setLivenessTimeout] = useState(String(current.livenessTimeoutSeconds));
  const [maxAttempts, setMaxAttempts] = useState(String(current.maxAuthAttempts));
  const [lockoutDuration, setLockoutDuration] = useState(String(current.lockoutDurationSeconds));
  const [syncBatchSize, setSyncBatchSize] = useState(String(current.syncBatchSize));
  const [peerSync, setPeerSync] = useState(current.offlinePeerSync);
  const [awsEndpoint, setAwsEndpoint] = useState(current.awsApiEndpoint);

  const save = () => {
    const thresholdVal = parseFloat(threshold);
    if (isNaN(thresholdVal) || thresholdVal < 0.6 || thresholdVal > 0.8) {
      Alert.alert('Invalid', 'Similarity threshold must be 0.60 – 0.80');
      return;
    }
    ConfigStore.setConfig({
      similarityThreshold: thresholdVal,
      livenessTimeoutSeconds: parseInt(livenessTimeout, 10) || DEFAULT_CONFIG.livenessTimeoutSeconds,
      maxAuthAttempts: parseInt(maxAttempts, 10) || DEFAULT_CONFIG.maxAuthAttempts,
      lockoutDurationSeconds: parseInt(lockoutDuration, 10) || DEFAULT_CONFIG.lockoutDurationSeconds,
      syncBatchSize: parseInt(syncBatchSize, 10) || DEFAULT_CONFIG.syncBatchSize,
      offlinePeerSync: peerSync,
      awsApiEndpoint: awsEndpoint.trim(),
    });
    Alert.alert('Saved', 'Configuration updated successfully.', [
      {text: 'OK', onPress: () => navigation.goBack()},
    ]);
  };

  const reset = () => {
    Alert.alert('Reset to Defaults?', 'All custom configuration will be lost.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          ConfigStore.resetToDefaults();
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionTitle}>Recognition</Text>
        <ConfigRow
          label="Similarity Threshold"
          hint="Range: 0.60–0.80 (default 0.68)"
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="decimal-pad"
        />
        <ConfigRow
          label="Max Auth Attempts"
          hint="Before lockout (default 3)"
          value={maxAttempts}
          onChangeText={setMaxAttempts}
          keyboardType="number-pad"
        />
        <ConfigRow
          label="Lockout Duration (sec)"
          hint="After max attempts (default 60)"
          value={lockoutDuration}
          onChangeText={setLockoutDuration}
          keyboardType="number-pad"
        />

        <Text style={styles.sectionTitle}>Liveness</Text>
        <ConfigRow
          label="Challenge Timeout (sec)"
          hint="Time to complete challenge (default 8)"
          value={livenessTimeout}
          onChangeText={setLivenessTimeout}
          keyboardType="number-pad"
        />

        <Text style={styles.sectionTitle}>Sync</Text>
        <ConfigRow
          label="Sync Batch Size"
          hint="Records per AWS upload (default 50)"
          value={syncBatchSize}
          onChangeText={setSyncBatchSize}
          keyboardType="number-pad"
        />
        <ConfigRow
          label="AWS API Endpoint"
          hint="e.g. https://api.example.com/v1"
          value={awsEndpoint}
          onChangeText={setAwsEndpoint}
          keyboardType="url"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Offline Peer Sync</Text>
            <Text style={styles.hint}>Local Wi-Fi enrollment propagation</Text>
          </View>
          <Switch
            value={peerSync}
            onValueChange={setPeerSync}
            trackColor={{false: '#374151', true: '#3b82f6'}}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>Save Configuration</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetBtnText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfigRow({
  label,
  hint,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: any;
}) {
  return (
    <View style={styles.configRow}>
      <Text style={styles.configLabel}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#64748b"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0f0f23'},
  container: {padding: 20, gap: 12, paddingBottom: 40},
  sectionTitle: {
    color: '#3b82f6',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 8,
  },
  configRow: {gap: 4},
  configLabel: {color: '#ffffff', fontSize: 14, fontWeight: '600'},
  hint: {color: '#64748b', fontSize: 12},
  input: {
    backgroundColor: '#1e1e3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d2d5a',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e3a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2d2d5a',
    marginTop: 4,
  },
  switchInfo: {flex: 1, marginRight: 12},
  switchLabel: {color: '#fff', fontSize: 14, fontWeight: '600'},
  saveBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  resetBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  resetBtnText: {color: '#ef4444', fontSize: 15, fontWeight: '600'},
});
