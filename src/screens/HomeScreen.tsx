/**
 * HomeScreen — Entry point / dashboard
 * Shows sync status and navigates to Attendance / Enrollment / Admin
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSyncStatus} from '../hooks/useSyncStatus';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

// Demo employee for testing — in production this comes from Datalake auth session
const DEMO_EMPLOYEE_ID = 'EMP001';

export function HomeScreen({navigation}: Props): React.JSX.Element {
  const {pendingCount, lastSyncAt, isSyncing, triggerSync} = useSyncStatus();

  const formatSync = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🛡️ FaceShield Edge</Text>
          <Text style={styles.subtitle}>v2.0 — Offline Biometric Auth</Text>
        </View>

        {/* Sync Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sync Status</Text>
          <View style={styles.row}>
            <View style={[styles.dot, {backgroundColor: isSyncing ? '#f59e0b' : pendingCount > 0 ? '#ef4444' : '#22c55e'}]} />
            <Text style={styles.cardValue}>
              {isSyncing ? 'Syncing…' : pendingCount > 0 ? `${pendingCount} records pending` : 'All synced'}
            </Text>
          </View>
          <Text style={styles.cardSub}>Last sync: {formatSync(lastSyncAt)}</Text>
          {pendingCount > 0 && !isSyncing && (
            <TouchableOpacity style={styles.syncBtn} onPress={triggerSync}>
              <Text style={styles.syncBtnText}>Sync Now</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => navigation.navigate('Attendance', {employeeId: DEMO_EMPLOYEE_ID})}>
          <Text style={styles.btnText}>✅  Verify Attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={() => navigation.navigate('Enrollment')}>
          <Text style={styles.btnText}>👤  Enroll New Employee</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnTertiary]}
          onPress={() => navigation.navigate('AdminConfig')}>
          <Text style={styles.btnText}>⚙️  Admin Config</Text>
        </TouchableOpacity>

        {/* Tech stack watermark */}
        <Text style={styles.watermark}>
          BlazeFace · MediaPipe · MobileFaceNet{'\n'}
          AES-256 · MMKV · AWS DynamoDB
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0f0f23'},
  container: {padding: 24, gap: 16},
  header: {alignItems: 'center', paddingVertical: 24},
  logo: {fontSize: 28, fontWeight: 'bold', color: '#ffffff'},
  subtitle: {fontSize: 13, color: '#94a3b8', marginTop: 4},
  card: {
    backgroundColor: '#1e1e3a',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  cardTitle: {fontSize: 12, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10},
  cardValue: {fontSize: 16, color: '#ffffff', fontWeight: '600'},
  cardSub: {fontSize: 12, color: '#64748b', marginTop: 4},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 10, height: 10, borderRadius: 5},
  syncBtn: {
    marginTop: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  syncBtnText: {color: '#fff', fontWeight: '600', fontSize: 14},
  btn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnPrimary: {backgroundColor: '#22c55e', borderColor: '#16a34a'},
  btnSecondary: {backgroundColor: '#3b82f6', borderColor: '#2563eb'},
  btnTertiary: {backgroundColor: '#1e1e3a', borderColor: '#2d2d5a'},
  btnText: {fontSize: 16, fontWeight: '700', color: '#ffffff'},
  watermark: {textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 8, lineHeight: 18},
});
