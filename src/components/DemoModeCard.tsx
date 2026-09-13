import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onTriggerDemo: (seconds: number) => void;
  isTriggering: boolean;
}

export const DemoModeCard: React.FC<Props> = ({ onTriggerDemo, isTriggering }) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>⚡ 2-MINUTE JUDGE DEMO MODE</Text>
        <Text style={styles.subBadge}>ISOLATED</Text>
      </View>
      <Text style={styles.description}>
        Compress time to demonstrate the complete vertical slice without waiting until tomorrow: AI
        Wake Plan → Lockscreen Alarm → Step Sensor Verification.
      </Text>

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btn15]}
          onPress={() => onTriggerDemo(15)}
          disabled={isTriggering}
        >
          <Text style={styles.btnText}>Test 15s Alarm</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btn30]}
          onPress={() => onTriggerDemo(30)}
          disabled={isTriggering}
        >
          <Text style={styles.btnText}>Test 30s Alarm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131C2E',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subBadge: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  description: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn15: {
    backgroundColor: '#38BDF8',
  },
  btn30: {
    backgroundColor: '#0284C7',
  },
  btnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
});
