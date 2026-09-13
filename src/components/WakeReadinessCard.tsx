import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WakeReadiness } from '../native/WakeMeUpBridge';

interface Props {
  readiness: WakeReadiness | null;
}

export const WakeReadinessCard: React.FC<Props> = ({ readiness }) => {
  if (!readiness) return null;

  const isBatteryLow = readiness.batteryLevel < 20 && !readiness.isCharging;
  const isHealthy = !isBatteryLow && readiness.canScheduleExactAlarm && readiness.hasStepSensor;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BEDTIME WAKE READINESS</Text>
        <View style={[styles.statusPill, isHealthy ? styles.statusOk : styles.statusWarn]}>
          <Text style={[styles.statusText, isHealthy ? styles.textOk : styles.textWarn]}>
            {isHealthy ? 'OPTIMAL' : 'AT RISK'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Battery</Text>
          <Text
            style={[
              styles.metricValue,
              readiness.batteryLevel < 20 ? styles.valWarn : styles.valOk,
            ]}
          >
            {readiness.batteryLevel}% {readiness.isCharging ? '⚡ Charging' : ''}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Step Counter</Text>
          <Text
            style={[styles.metricValue, readiness.hasStepSensor ? styles.valOk : styles.valWarn]}
          >
            {readiness.hasStepSensor ? '✓ Hardware Ready' : '✗ Fallback QR'}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Exact Alarm</Text>
          <Text
            style={[
              styles.metricValue,
              readiness.canScheduleExactAlarm ? styles.valOk : styles.valWarn,
            ]}
          >
            {readiness.canScheduleExactAlarm ? '✓ Authorized' : '✗ Needs Grant'}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Offline Execution</Text>
          <Text style={styles.valOk}>✓ Room & AlarmManager</Text>
        </View>
      </View>

      {isBatteryLow && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⚠️ Battery is low and not charging. Plug in your device before sleeping to prevent missed
            alarms.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131C2E',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  textOk: {
    color: '#10B981',
  },
  textWarn: {
    color: '#F59E0B',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricItem: {
    width: '48%',
    marginBottom: 10,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  valOk: {
    color: '#F8FAFC',
  },
  valWarn: {
    color: '#F59E0B',
  },
  warningBox: {
    marginTop: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 12,
    lineHeight: 16,
  },
});
