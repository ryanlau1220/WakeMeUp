import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  currentSteps: number;
  requiredSteps: number;
  isVerified: boolean;
  onOpenQr: () => void;
}

export function VerificationActiveCard({
  currentSteps,
  requiredSteps,
  isVerified,
  onOpenQr,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const ratio = Math.min(1, currentSteps / requiredSteps);

  useEffect(() => {
    Animated.spring(progress, { toValue: ratio, useNativeDriver: false }).start();
  }, [progress, ratio]);

  if (isVerified) {
    return (
      <View style={[styles.card, styles.done]}>
        <Text style={styles.doneTitle}>You’re up.</Text>
        <Text style={styles.doneText}>Wake-up verified.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Keep moving</Text>
      <View style={styles.countRow}>
        <Text style={styles.count}>{currentSteps}</Text>
        <Text style={styles.total}>/ {requiredSteps}</Text>
      </View>
      <Animated.View
        style={[
          styles.track,
          {
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
      <TouchableOpacity onPress={onOpenQr} style={styles.qr}>
        <Text style={styles.qrText}>Use bathroom QR instead</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f0a36d', borderRadius: 28, padding: 24, marginBottom: 18 },
  done: { backgroundColor: '#5b7660' },
  kicker: {
    color: '#4b2c22',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  count: { color: '#1f2621', fontFamily: 'serif', fontSize: 58, fontWeight: '800' },
  total: { color: '#4b2c22', fontSize: 21, fontWeight: '700' },
  track: { height: 7, borderRadius: 4, backgroundColor: '#1f2621', marginTop: 12 },
  qr: { marginTop: 20, alignSelf: 'flex-start' },
  qrText: { color: '#1f2621', fontSize: 14, fontWeight: '800' },
  doneTitle: { color: '#fff9f0', fontFamily: 'serif', fontSize: 38, fontWeight: '800' },
  doneText: { color: '#d8ded4', fontSize: 15, marginTop: 5 },
});
