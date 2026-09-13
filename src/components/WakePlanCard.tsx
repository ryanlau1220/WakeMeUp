import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WakePlan } from '../native/WakeMeUpBridge';

interface Props {
  plan: WakePlan;
  isDraft: boolean;
  onApprove: (plan: WakePlan) => void;
  onAdjust: (plan: WakePlan) => void;
  onReject: (plan: WakePlan) => void;
  onCancel?: (planId: string) => void;
}

function formatTime(millis: number) {
  return new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function reasonsFor(plan: WakePlan): string[] {
  if (Array.isArray(plan.reasoningSummary)) return plan.reasoningSummary;
  if (typeof plan.reasoningSummary !== 'string') return [];
  try {
    return plan.reasoningSummary.startsWith('[')
      ? JSON.parse(plan.reasoningSummary)
      : [plan.reasoningSummary];
  } catch {
    return [];
  }
}

export function WakePlanCard({ plan, isDraft, onApprove, onAdjust, onReject, onCancel }: Props) {
  const reasons = reasonsFor(plan);

  return (
    <View style={[styles.card, isDraft ? styles.draft : styles.armed]}>
      <Text style={styles.eyebrow}>{isDraft ? 'Wake plan' : 'Alarm set'}</Text>
      <Text style={styles.title} numberOfLines={3}>
        {plan.eventTitle}
      </Text>
      <Text style={styles.event}>Starts {formatTime(plan.eventStart)}</Text>

      <View style={styles.times}>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Alarm</Text>
          <Text style={styles.time} adjustsFontSizeToFit numberOfLines={1}>
            {formatTime(plan.firstAlarmAt)}
          </Text>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Out of bed</Text>
          <Text style={styles.time} adjustsFontSizeToFit numberOfLines={1}>
            {formatTime(plan.wakeObjectiveAt)}
          </Text>
        </View>
      </View>

      <Text style={styles.method}>{plan.requiredSteps} steps · QR if needed</Text>
      {reasons.map((reason, index) => (
        <Text key={`${index}-${reason}`} style={styles.reason}>
          {reason}
        </Text>
      ))}

      {isDraft ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primary} onPress={() => onApprove(plan)}>
            <Text style={styles.primaryText}>Set alarm</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textButton} onPress={() => onAdjust(plan)}>
            <Text style={styles.textButtonText}>Change</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textButton} onPress={() => onReject(plan)}>
            <Text style={styles.rejectText}>Not now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => onCancel?.(plan.id)} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel alarm</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#202821',
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    width: '100%',
  },
  draft: { borderWidth: 1, borderColor: '#f0a36d' },
  armed: { borderWidth: 1, borderColor: '#5b7660' },
  eyebrow: {
    color: '#f0a36d',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: '#fff9f0',
    fontFamily: 'serif',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 5,
    flexShrink: 1,
  },
  event: { color: '#b9c1b5', fontSize: 14, marginTop: 5 },
  times: { gap: 12, marginTop: 24, marginBottom: 18 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 16,
  },
  timeLabel: { color: '#a6afa3', fontSize: 13, marginBottom: 3 },
  time: { color: '#fff9f0', fontFamily: 'serif', fontSize: 34, fontWeight: '800' },
  method: { color: '#d8ded4', fontSize: 14, marginBottom: 12 },
  reason: { color: '#a6afa3', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 22 },
  primary: {
    backgroundColor: '#f0a36d',
    borderRadius: 15,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryText: { color: '#202821', fontSize: 15, fontWeight: '800' },
  textButton: { paddingVertical: 12 },
  textButtonText: { color: '#fff9f0', fontSize: 14, fontWeight: '700' },
  rejectText: { color: '#a6afa3', fontSize: 14, fontWeight: '700' },
  cancel: { marginTop: 20, alignSelf: 'flex-start' },
  cancelText: { color: '#f0a36d', fontSize: 14, fontWeight: '700' },
});
