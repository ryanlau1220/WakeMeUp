import { StyleSheet, Text, View } from 'react-native';
import type { WakeReadiness } from '../native/WakeMeUpBridge';

interface Props {
  readiness: WakeReadiness | null;
}

export function WakeReadinessCard({ readiness }: Props) {
  if (!readiness) return null;

  const notices = [
    !readiness.canScheduleExactAlarm && 'Allow exact alarms before setting a wake-up.',
    !readiness.canUseFullScreenIntent && 'Allow full-screen alarms for the lock screen.',
    readiness.batteryLevel < 20 && !readiness.isCharging && 'Battery is low — charge before sleep.',
    !readiness.hasStepSensor && 'This phone will use QR verification.',
  ].filter((notice): notice is string => Boolean(notice));

  if (notices.length === 0) return null;

  return (
    <View style={styles.card}>
      {notices.map((notice) => (
        <Text key={notice} style={styles.notice}>
          {notice}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#332c22', borderRadius: 16, padding: 15, marginBottom: 18 },
  notice: { color: '#f0c67a', fontSize: 14, lineHeight: 20 },
});
