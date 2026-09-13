import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { requestAgentWakePlan, sendTelegramEscalation } from './src/api/agentClient';
import { CalendarList } from './src/components/CalendarList';
import { DemoModeCard } from './src/components/DemoModeCard';
import { VerificationActiveCard } from './src/components/VerificationActiveCard';
import { WakePlanCard } from './src/components/WakePlanCard';
import { WakeReadinessCard } from './src/components/WakeReadinessCard';
import {
  Bridge,
  type CalendarEvent,
  type WakePlan,
  type WakeReadiness,
} from './src/native/WakeMeUpBridge';

export default function App() {
  const [readiness, setReadiness] = useState<WakeReadiness | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activePlan, setActivePlan] = useState<WakePlan | null>(null);
  const [draftPlan, setDraftPlan] = useState<WakePlan | null>(null);

  // Verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [currentSteps, setCurrentSteps] = useState(0);
  const [requiredSteps, setRequiredSteps] = useState(15);
  const [isVerified, setIsVerified] = useState(false);
  const [verifyingPlanId, setVerifyingPlanId] = useState<string | null>(null);

  // Adjust Plan modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustNote, setAdjustNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // QR Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  useEffect(() => {
    initApp();
    return setupEventListeners();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
        PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      ]);
    } catch (e) {
      console.warn('Permission request error:', e);
    }
  };

  const initApp = async () => {
    await requestPermissions();
    await refreshState();
  };

  const refreshState = async () => {
    try {
      const read = await Bridge.getWakeReadiness();
      setReadiness(read);

      const active = await Bridge.getActivePlan();
      setActivePlan(active);

      const evts = await Bridge.getUpcomingEvents(36);
      setEvents(evts);
    } catch (err) {
      console.warn('State refresh error:', err);
    }
  };

  const setupEventListeners = () => {
    const subAlarm = Bridge.onAlarmTriggered((data) => {
      console.log('Bridge Event: ALARM_TRIGGERED', data);
    });

    const subDismissed = Bridge.onAlarmDismissed((data) => {
      console.log('Bridge Event: ALARM_DISMISSED', data);
      setIsVerifying(true);
      setCurrentSteps(0);
      setRequiredSteps(data.requiredSteps || 15);
      setIsVerified(false);
      setVerifyingPlanId(data.planId);
    });

    const subStep = Bridge.onStepProgress((data) => {
      console.log('Bridge Event: STEP_PROGRESS', data.steps);
      setIsVerifying(true);
      setCurrentSteps(data.steps);
      setRequiredSteps(data.requiredSteps);
    });

    const subVerified = Bridge.onWakeVerified((data) => {
      console.log('Bridge Event: WAKE_VERIFIED', data);
      setIsVerifying(true);
      setIsVerified(true);
      refreshState();
    });

    const subQr = Bridge.onQrRequired((data) => {
      console.log('Bridge Event: QR_REQUIRED', data);
      setVerifyingPlanId(data.planId);
      setIsQrModalOpen(true);
    });

    const subEscalated = Bridge.onEscalated((data) => {
      void sendTelegramEscalation(
        data.eventTitle,
        `Wake plan ${data.planId} remained unverified after all alarm retries.`,
      );
    });

    return () => {
      subAlarm?.remove();
      subDismissed?.remove();
      subStep?.remove();
      subVerified?.remove();
      subQr?.remove();
      subEscalated?.remove();
    };
  };

  const handleGeneratePlan = async (event: CalendarEvent) => {
    setIsProcessing(true);
    try {
      const plan = await requestAgentWakePlan(
        [event],
        undefined,
        await Bridge.getRecentWakeHistory(),
      );
      setDraftPlan(plan);
    } catch (err: any) {
      Alert.alert('Agent Error', err.message || 'Failed to generate wake plan from agent.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprovePlan = async (plan: WakePlan) => {
    try {
      const currentReadiness = await Bridge.getWakeReadiness();
      if (!currentReadiness.canScheduleExactAlarm) {
        await Bridge.requestExactAlarmPermission();
        Alert.alert(
          'Allow exact alarms',
          'Grant Alarms & reminders access in Android Settings, then approve this Wake Plan again.',
        );
        await refreshState();
        return;
      }
      if (!currentReadiness.canUseFullScreenIntent) {
        await Bridge.requestFullScreenIntentPermission();
        Alert.alert(
          'Allow full-screen alarms',
          'Allow full-screen notifications in Android Settings, then approve this Wake Plan again.',
        );
        await refreshState();
        return;
      }
      await Bridge.saveAndSchedulePlan(plan);
      await Bridge.savePlanFeedback(plan.id, 'APPROVED');
      setDraftPlan(null);
      await refreshState();
      Alert.alert(
        'Wake Plan Approved & Scheduled',
        `Native alarm set for ${new Date(plan.firstAlarmAt).toLocaleTimeString()}. Offline execution guaranteed by Android.`,
      );
    } catch (err: any) {
      Alert.alert('Scheduling Error', err.message || 'Could not schedule alarm.');
    }
  };

  const handleRejectPlan = async (plan: WakePlan) => {
    await Bridge.savePlanFeedback(plan.id, 'REJECTED', adjustNote);
    setDraftPlan(null);
    setAdjustNote('');
  };

  const handleCancelActivePlan = async (planId: string) => {
    await Bridge.cancelPlan(planId);
    await refreshState();
  };

  const handleTriggerDemo = async (delaySeconds: number) => {
    try {
      await Bridge.triggerDemoAlarm(delaySeconds);
      Alert.alert(
        'Demo Alarm Armed',
        `Alarm scheduled in ${delaySeconds} seconds.\n\n👉 LOCK YOUR PHONE SCREEN NOW to test the full-screen lockscreen wake-up and 15-step sensor verification.`,
      );
      await refreshState();
    } catch (err: any) {
      Alert.alert('Demo Error', err.message || 'Could not trigger demo alarm.');
    }
  };

  const handleSimulateStep = () => {
    const next = currentSteps + 1;
    setCurrentSteps(next);
    if (next >= requiredSteps) {
      setIsVerified(true);
    }
  };

  const handleQrScan = async () => {
    if (!verifyingPlanId) return;
    try {
      const ok = await Bridge.scanQrCode('WAKEMEUP_BATHROOM_QR', verifyingPlanId);
      if (ok) {
        setIsQrModalOpen(false);
        setIsVerified(true);
        Alert.alert('QR Verified', 'Bathroom scan confirmed. Wake objective satisfied!');
        await refreshState();
      } else {
        Alert.alert('Invalid QR', 'This QR code is not the configured bathroom verification code.');
      }
    } catch (err: any) {
      Alert.alert('Scanner Error', err.message || 'Could not open the QR scanner.');
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.appName}>WAKE ME UP</Text>
              <Text style={styles.appTagline}>Schedule-Aware Mobile Wake Agent</Text>
            </View>
            <View style={styles.onlineBadge}>
              <View style={styles.dot} />
              <Text style={styles.onlineText}>AGENT READY</Text>
            </View>
          </View>

          {/* Active Step Verification Card (shown when alarming/verifying) */}
          {(isVerifying || isVerified) && (
            <VerificationActiveCard
              currentSteps={currentSteps}
              requiredSteps={requiredSteps}
              isVerified={isVerified}
              onOpenQr={() => setIsQrModalOpen(true)}
              onSimulateStep={handleSimulateStep}
            />
          )}

          {/* Bedtime Wake Readiness */}
          <WakeReadinessCard readiness={readiness} />

          {/* AI Draft Plan (Awaiting Human-in-the-Loop Review) */}
          {draftPlan && (
            <WakePlanCard
              plan={draftPlan}
              isDraft={true}
              onApprove={handleApprovePlan}
              onAdjust={() => setIsAdjustModalOpen(true)}
              onReject={handleRejectPlan}
            />
          )}

          {/* Active Scheduled Plan (if no draft pending) */}
          {!draftPlan && activePlan && (
            <WakePlanCard
              plan={activePlan}
              isDraft={false}
              onApprove={() => {}}
              onAdjust={() => {}}
              onReject={() => {}}
              onCancel={handleCancelActivePlan}
            />
          )}

          {/* 2-Minute Demo Mode Trigger */}
          <DemoModeCard onTriggerDemo={handleTriggerDemo} isTriggering={isProcessing} />

          {/* Upcoming Google Calendar Commitments */}
          <CalendarList
            events={events}
            onRefresh={refreshState}
            onGeneratePlan={handleGeneratePlan}
          />

          {/* Footer Note */}
          <Text style={styles.footerNote}>
            AI for contextual judgment • Deterministic Android for alarm & sensor reliability
          </Text>
        </ScrollView>

        {/* QR Code Verification Fallback Modal */}
        <Modal visible={isQrModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Scan Bathroom QR Code</Text>
              <Text style={styles.modalSub}>
                Physical QR verification placed in your bathroom proves you are out of bed.
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSubmit]}
                  onPress={handleQrScan}
                >
                  <Text style={styles.modalSubmitText}>Open QR Scanner</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalClose]}
                  onPress={() => setIsQrModalOpen(false)}
                >
                  <Text style={styles.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Adjust Plan Modal */}
        <Modal visible={isAdjustModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Adjust Wake Plan</Text>
              <Text style={styles.modalSub}>Tell the agent how to adjust your wake objective:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Make it 15 minutes later, I prep quickly"
                placeholderTextColor="#64748B"
                value={adjustNote}
                onChangeText={setAdjustNote}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSubmit]}
                  onPress={async () => {
                    const event = events.find((item) => item.id === draftPlan?.calendarEventId);
                    if (!draftPlan || !event) return;
                    setIsProcessing(true);
                    try {
                      await Bridge.savePlanFeedback(draftPlan.id, 'ADJUSTED', adjustNote);
                      const revisedPlan = await requestAgentWakePlan(
                        [event],
                        undefined,
                        await Bridge.getRecentWakeHistory(),
                        adjustNote,
                      );
                      setDraftPlan({ ...revisedPlan, id: draftPlan.id });
                      setAdjustNote('');
                      setIsAdjustModalOpen(false);
                    } catch (err: any) {
                      Alert.alert(
                        'Adjustment Error',
                        err.message || 'Could not revise the wake plan.',
                      );
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                >
                  <Text style={styles.modalSubmitText}>Apply Adjustment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalClose]}
                  onPress={() => setIsAdjustModalOpen(false)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080C14',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  appTagline: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  onlineText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  footerNote: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#0B1120',
    color: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSubmit: {
    backgroundColor: '#38BDF8',
  },
  modalSubmitText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 13,
  },
  modalClose: {
    backgroundColor: '#1E293B',
  },
  modalCloseText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13,
  },
});
