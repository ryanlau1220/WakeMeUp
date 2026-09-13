import type React from 'react';
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

export const WakePlanCard: React.FC<Props> = ({
  plan,
  isDraft,
  onApprove,
  onAdjust,
  onReject,
  onCancel,
}) => {
  const formatTime = (millis: number) => {
    if (!millis) return '--:--';
    return new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const reasons = Array.isArray(plan.reasoningSummary)
    ? plan.reasoningSummary
    : typeof plan.reasoningSummary === 'string' && plan.reasoningSummary.startsWith('[')
      ? JSON.parse(plan.reasoningSummary)
      : [plan.reasoningSummary || 'Contextual schedule interpretation.'];

  return (
    <View style={[styles.card, isDraft ? styles.draftBorder : styles.activeBorder]}>
      <View style={styles.topBadgeRow}>
        <Text style={styles.badgeText}>
          {isDraft ? '✨ AI PROPOSED WAKE STRATEGY' : '🔒 APPROVED & SCHEDULED OFFLINE'}
        </Text>
        <Text style={styles.eventTime}>Event: {formatTime(plan.eventStart)}</Text>
      </View>

      <Text style={styles.eventTitle}>{plan.eventTitle}</Text>

      {/* Main Timing Banner */}
      <View style={styles.timingContainer}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>First Alarm</Text>
          <Text style={styles.timeBig}>{formatTime(plan.firstAlarmAt)}</Text>
          <Text style={styles.timeSub}>Gentle chime</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Wake Objective</Text>
          <Text style={[styles.timeBig, styles.objectiveColor]}>
            {formatTime(plan.wakeObjectiveAt)}
          </Text>
          <Text style={styles.timeSub}>Must be out of bed</Text>
        </View>
      </View>

      {/* Verification Strategy */}
      <View style={styles.verificationRow}>
        <Text style={styles.verificationTitle}>Physical Verification:</Text>
        <Text style={styles.verificationDetail}>
          🚶 {plan.requiredSteps} steps (Sensor) • 📸 QR Fallback
        </Text>
      </View>

      {/* Agent Reasoning */}
      <View style={styles.reasoningBox}>
        <Text style={styles.reasoningHeader}>Agent Reasoning:</Text>
        {reasons.map((r: string, idx: number) => (
          <Text key={`reason-${r.slice(0, 16)}-${idx}`} style={styles.reasonItem}>
            • {r}
          </Text>
        ))}
      </View>

      {/* Human Review Actions */}
      {isDraft ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={() => onApprove(plan)}>
            <Text style={styles.btnApproveText}>Approve Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnAdjust]} onPress={() => onAdjust(plan)}>
            <Text style={styles.btnAdjustText}>Adjust</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={() => onReject(plan)}>
            <Text style={styles.btnRejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.activeFooter}>
          <View style={styles.statusLive}>
            <View style={styles.greenDot} />
            <Text style={styles.statusLiveText}>Armed with Android AlarmManager</Text>
          </View>
          {onCancel && (
            <TouchableOpacity onPress={() => onCancel(plan.id)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1.5,
  },
  draftBorder: {
    borderColor: '#38BDF8',
  },
  activeBorder: {
    borderColor: '#10B981',
  },
  topBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  eventTime: {
    color: '#94A3B8',
    fontSize: 12,
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  timingContainer: {
    flexDirection: 'row',
    backgroundColor: '#0B1120',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  timeBig: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
  },
  objectiveColor: {
    color: '#38BDF8',
  },
  timeSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#1E293B',
  },
  verificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  verificationTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  verificationDetail: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  reasoningBox: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  reasoningHeader: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  reasonItem: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnApprove: {
    flex: 2,
    backgroundColor: '#10B981',
  },
  btnApproveText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  btnAdjust: {
    flex: 1.2,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  btnAdjustText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
  },
  btnReject: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  btnRejectText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  activeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  statusLive: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  statusLiveText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
