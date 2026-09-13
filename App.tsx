import { useEffect, useRef, useState } from 'react';
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
  type WakeSettings,
} from './src/native/WakeMeUpBridge';

const defaultWakeSettings: WakeSettings = {
  prepMinutes: 25,
  travelMinutes: 30,
  safetyMargin: 10,
  qrCode: 'WAKEMEUP_BATHROOM_QR',
  telegramEscalationEnabled: false,
};

export default function App() {
  const [readiness, setReadiness] = useState<WakeReadiness | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activePlan, setActivePlan] = useState<WakePlan | null>(null);
  const [draftPlan, setDraftPlan] = useState<WakePlan | null>(null);
  const [wakeSettings, setWakeSettings] = useState<WakeSettings>(defaultWakeSettings);
  const wakeSettingsRef = useRef(wakeSettings);
  const [wakeHistory, setWakeHistory] = useState<
    Awaited<ReturnType<typeof Bridge.getRecentWakeHistory>>
  >([]);

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
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<WakeSettings>(defaultWakeSettings);

  useEffect(() => {
    initApp();
    return setupEventListeners();
  }, []);

  useEffect(() => {
    wakeSettingsRef.current = wakeSettings;
  }, [wakeSettings]);

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
    const settings = await Bridge.getWakeSettings();
    setWakeSettings(settings);
    setSettingsDraft(settings);
    await refreshState();
  };

  const refreshState = async () => {
    try {
      const [read, active, evts, history] = await Promise.all([
        Bridge.getWakeReadiness(),
        Bridge.getActivePlan(),
        Bridge.getUpcomingEvents(36),
        Bridge.getRecentWakeHistory(),
      ]);
      setReadiness(read);
      setActivePlan(active);
      setEvents(evts);
      setWakeHistory(history);
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
      if (!wakeSettingsRef.current.telegramEscalationEnabled) return;
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
        wakeSettings,
        await Bridge.getRecentWakeHistory(),
      );
      setDraftPlan(plan);
    } catch (err: any) {
      Alert.alert('Agent Error', err.message || 'Failed to generate wake plan from agent.');
    } finally {
      setIsProcessing(false);
    }
  };

  const ensureAlarmPermissions = async () => {
    const currentReadiness = await Bridge.getWakeReadiness();
    if (!currentReadiness.canScheduleExactAlarm) {
      await Bridge.requestExactAlarmPermission();
      Alert.alert(
        'Allow exact alarms',
        'Grant Alarms & reminders access in Android Settings, then try again.',
      );
      await refreshState();
      return false;
    }
    if (!currentReadiness.canUseFullScreenIntent) {
      await Bridge.requestFullScreenIntentPermission();
      Alert.alert(
        'Allow full-screen alarms',
        'Allow full-screen notifications in Android Settings, then try again.',
      );
      await refreshState();
      return false;
    }
    return true;
  };

  const handleApprovePlan = async (plan: WakePlan) => {
    try {
      if (!(await ensureAlarmPermissions())) return;
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

  const saveSettings = async () => {
    const minutes = [
      settingsDraft.prepMinutes,
      settingsDraft.travelMinutes,
      settingsDraft.safetyMargin,
    ];
    if (
      minutes.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 180) ||
      !settingsDraft.qrCode.trim() ||
      settingsDraft.qrCode.trim().length > 120
    ) {
      Alert.alert(
        'Invalid settings',
        'Use whole minutes from 0 to 180 and a QR value up to 120 characters.',
      );
      return;
    }
    try {
      const savedSettings = { ...settingsDraft, qrCode: settingsDraft.qrCode.trim() };
      await Bridge.saveWakeSettings(savedSettings);
      setWakeSettings(savedSettings);
      setIsSettingsModalOpen(false);
    } catch (err: any) {
      Alert.alert('Settings Error', err.message || 'Could not save wake settings.');
    }
  };

  const handleTriggerDemo = async (delaySeconds: number) => {
    try {
      if (!(await ensureAlarmPermissions())) return;
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

  const handleQrScan = async () => {
    if (!verifyingPlanId) return;
    try {
      const ok = await Bridge.scanQrCode(wakeSettings.qrCode, verifyingPlanId);
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
            <Text style={styles.appName}>wake me up</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => {
                setSettingsDraft(wakeSettings);
                setIsSettingsModalOpen(true);
              }}
            >
              <Text style={styles.settingsButtonText}>SETTINGS</Text>
            </TouchableOpacity>
          </View>

          {/* Active Step Verification Card (shown when alarming/verifying) */}
          {(isVerifying || isVerified) && (
            <VerificationActiveCard
              currentSteps={currentSteps}
              requiredSteps={requiredSteps}
              isVerified={isVerified}
              onOpenQr={() => setIsQrModalOpen(true)}
            />
          )}

          {draftPlan && (
            <WakePlanCard
              plan={draftPlan}
              isDraft={true}
              onApprove={handleApprovePlan}
              onAdjust={() => setIsAdjustModalOpen(true)}
              onReject={handleRejectPlan}
            />
          )}

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

          <CalendarList
            events={events}
            onRefresh={refreshState}
            onGeneratePlan={handleGeneratePlan}
          />

          <WakeReadinessCard readiness={readiness} />

          {wakeHistory.length > 0 && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>Recently</Text>
              {wakeHistory.slice(0, 3).map((entry) => (
                <Text
                  key={`${entry.wakePlanId}-${entry.alarmTriggeredAt}`}
                  style={styles.historyItem}
                >
                  {entry.success ? '✓ Verified' : '• Unverified'} · {entry.attemptCount} attempt
                  {entry.attemptCount === 1 ? '' : 's'} ·{' '}
                  {new Date(entry.alarmTriggeredAt).toLocaleDateString()}
                </Text>
              ))}
            </View>
          )}

          <DemoModeCard onTriggerDemo={handleTriggerDemo} isTriggering={isProcessing} />
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

        <Modal visible={isSettingsModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Wake Settings</Text>
              <Text style={styles.inputLabel}>Preparation · minutes</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={
                  Number.isFinite(settingsDraft.prepMinutes)
                    ? String(settingsDraft.prepMinutes)
                    : ''
                }
                onChangeText={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    prepMinutes: value === '' ? Number.NaN : Number(value),
                  }))
                }
              />
              <Text style={styles.inputLabel}>Travel · minutes</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={
                  Number.isFinite(settingsDraft.travelMinutes)
                    ? String(settingsDraft.travelMinutes)
                    : ''
                }
                onChangeText={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    travelMinutes: value === '' ? Number.NaN : Number(value),
                  }))
                }
              />
              <Text style={styles.inputLabel}>Margin · minutes</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={
                  Number.isFinite(settingsDraft.safetyMargin)
                    ? String(settingsDraft.safetyMargin)
                    : ''
                }
                onChangeText={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    safetyMargin: value === '' ? Number.NaN : Number(value),
                  }))
                }
              />
              <Text style={styles.inputLabel}>Bathroom QR</Text>
              <TextInput
                style={styles.input}
                value={settingsDraft.qrCode}
                onChangeText={(value) =>
                  setSettingsDraft((current) => ({ ...current, qrCode: value }))
                }
              />
              <TouchableOpacity
                style={styles.telegramToggle}
                onPress={() =>
                  setSettingsDraft((current) => ({
                    ...current,
                    telegramEscalationEnabled: !current.telegramEscalationEnabled,
                  }))
                }
              >
                <Text style={styles.telegramToggleText}>
                  Telegram escalation: {settingsDraft.telegramEscalationEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSubmit]}
                  onPress={saveSettings}
                >
                  <Text style={styles.modalSubmitText}>Save Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalClose]}
                  onPress={() => setIsSettingsModalOpen(false)}
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
              <Text style={styles.inputLabel}>What should change?</Text>
              <TextInput style={styles.input} value={adjustNote} onChangeText={setAdjustNote} />
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
                        wakeSettings,
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
    backgroundColor: '#141914',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 26,
    marginTop: 12,
  },
  appName: {
    color: '#fff9f0',
    fontFamily: 'serif',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: '#4a554a',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  settingsButtonText: {
    color: '#d8ded4',
    fontSize: 11,
    fontWeight: '800',
  },
  historyCard: {
    marginBottom: 16,
  },
  historyTitle: {
    color: '#8f9a8d',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  historyItem: {
    color: '#d8ded4',
    fontSize: 13,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12,15,12,0.86)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#202821',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#4a554a',
  },
  modalTitle: {
    color: '#fff9f0',
    fontFamily: 'serif',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSub: {
    color: '#b9c1b5',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#141914',
    color: '#fff9f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4a554a',
  },
  inputLabel: {
    color: '#b9c1b5',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },
  telegramToggle: {
    backgroundColor: '#141914',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4a554a',
  },
  telegramToggleText: {
    color: '#d8ded4',
    fontSize: 14,
    fontWeight: '700',
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
    backgroundColor: '#f0a36d',
  },
  modalSubmitText: {
    color: '#202821',
    fontWeight: '800',
    fontSize: 13,
  },
  modalClose: {
    backgroundColor: '#2d362e',
  },
  modalCloseText: {
    color: '#d8ded4',
    fontWeight: '700',
    fontSize: 13,
  },
});
