import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  currentSteps: number;
  requiredSteps: number;
  isVerified: boolean;
  onOpenQr: () => void;
  onSimulateStep?: () => void;
}

export const VerificationActiveCard: React.FC<Props> = ({
  currentSteps,
  requiredSteps,
  isVerified,
  onOpenQr,
  onSimulateStep,
}) => {
  const progressPct = Math.min(100, Math.round((currentSteps / requiredSteps) * 100));

  if (isVerified) {
    return (
      <View style={[styles.card, styles.verifiedBorder]}>
        <Text style={styles.verifiedBadge}>🎉 WAKE VERIFIED</Text>
        <Text style={styles.verifiedTitle}>Your Morning Has Officially Started!</Text>
        <Text style={styles.verifiedSub}>
          Physical movement confirmed ({currentSteps} steps observed). Alarm dismissed permanently.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.activeBorder]}>
      <View style={styles.headerRow}>
        <View style={styles.blinkingDot} />
        <Text style={styles.headerTitle}>ACTIVE STEP VERIFICATION</Text>
      </View>

      <Text style={styles.instructions}>
        Alarm dismissed. Walk around with your phone to prove you're out of bed!
      </Text>

      {/* Steps Display */}
      <View style={styles.counterBox}>
        <Text style={styles.stepNum}>{currentSteps}</Text>
        <Text style={styles.stepTotal}>/ {requiredSteps} STEPS</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.qrBtn} onPress={onOpenQr}>
          <Text style={styles.qrBtnText}>📷 Use Bathroom QR Code</Text>
        </TouchableOpacity>

        {onSimulateStep && (
          <TouchableOpacity style={styles.simBtn} onPress={onSimulateStep}>
            <Text style={styles.simBtnText}>+1 Step (Desk Test)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
  },
  activeBorder: {
    borderColor: '#F59E0B',
  },
  verifiedBorder: {
    borderColor: '#10B981',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  blinkingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    marginRight: 8,
  },
  headerTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  instructions: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  counterBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepNum: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '900',
  },
  stepTotal: {
    color: '#94A3B8',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#0B1120',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  qrBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  qrBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  simBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  simBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  verifiedBadge: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  verifiedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  verifiedSub: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
});
