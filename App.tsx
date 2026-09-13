import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  AppState,
  Easing,
  Image,
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
import { createManualWakePlan } from './src/manualAlarm';
import { CopilotKitProvider, useAgentContext } from '@copilotkit/react-native/headless';
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

type AppTab = 'home' | 'alarms' | 'recent' | 'settings' | 'demo';
type TabIconName = 'history' | 'alarm' | 'home' | 'settings' | 'demo';

const tabs: { id: AppTab; label: string; icon: TabIconName }[] = [
  { id: 'recent', label: 'Recent', icon: 'history' },
  { id: 'alarms', label: 'Alarms', icon: 'alarm' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'demo', label: 'Demo', icon: 'demo' },
];

function FooterIcon({ icon, active }: { icon: TabIconName; active: boolean }) {
  const color = active ? '#f0a36d' : '#839080';

  if (icon === 'home') return <Text style={[styles.homeIcon, { color }]}>⌂</Text>;
  if (icon === 'history') {
    return (
      <View style={styles.historyIconFrame}>
        <Text style={[styles.historyIcon, { color }]}>↺</Text>
      </View>
    );
  }
  if (icon === 'settings') {
    return (
      <View style={styles.sliderIcon}>
        <View style={[styles.sliderRail, { backgroundColor: color }]}>
          <View style={[styles.sliderKnob, { backgroundColor: color, left: 4 }]} />
        </View>
        <View style={[styles.sliderRail, { backgroundColor: color }]}>
          <View style={[styles.sliderKnob, { backgroundColor: color, right: 4 }]} />
        </View>
        <View style={[styles.sliderRail, { backgroundColor: color }]}>
          <View style={[styles.sliderKnob, { backgroundColor: color, left: 9 }]} />
        </View>
      </View>
    );
  }
  if (icon === 'demo') {
    return (
      <View style={[styles.demoIcon, { borderColor: color }]}>
        <View style={[styles.demoPlay, { borderLeftColor: color }]} />
      </View>
    );
  }

  return (
    <View style={styles.clockIcon}>
      <View style={[styles.clockFace, { borderColor: color }]}>
        <View style={[styles.clockHourHand, { backgroundColor: color }]} />
        <View style={[styles.clockMinuteHand, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function formatManualTime(hour: string, minute: string) {
  const time = new Date();
  time.setHours(Number(hour), Number(minute), 0, 0);
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CopilotWakeContext({
  plan,
  settings,
}: {
  plan: WakePlan | null;
  settings: WakeSettings;
}) {
  useAgentContext({
    description: 'The current Wake Me Up plan and preferences for plan review or adjustment.',
    value: plan
      ? {
          eventTitle: plan.eventTitle,
          eventStart: plan.eventStart,
          wakeObjectiveAt: plan.wakeObjectiveAt,
          firstAlarmAt: plan.firstAlarmAt,
          requiredSteps: plan.requiredSteps,
          preferences: {
            prepMinutes: settings.prepMinutes,
            travelMinutes: settings.travelMinutes,
            safetyMargin: settings.safetyMargin,
          },
        }
      : {
          preferences: {
            prepMinutes: settings.prepMinutes,
            travelMinutes: settings.travelMinutes,
            safetyMargin: settings.safetyMargin,
          },
        },
  });
  return null;
}

function WakeMeUpApp() {
  const [readiness, setReadiness] = useState<WakeReadiness | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activePlan, setActivePlan] = useState<WakePlan | null>(null);
  const [scheduledPlans, setScheduledPlans] = useState<WakePlan[]>([]);
  const [draftPlan, setDraftPlan] = useState<WakePlan | null>(null);
  const [confirmationPlan, setConfirmationPlan] = useState<WakePlan | null>(null);
  const [rejectingPlan, setRejectingPlan] = useState<WakePlan | null>(null);
  const [recentlyCancelledPlan, setRecentlyCancelledPlan] = useState<WakePlan | null>(null);
  const [wakeSettings, setWakeSettings] = useState<WakeSettings>(defaultWakeSettings);
  const wakeSettingsRef = useRef(wakeSettings);
  const cancelUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escalationRetryInFlight = useRef(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successSpin = useRef(new Animated.Value(0)).current;
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
  const [settingsDraft, setSettingsDraft] = useState<WakeSettings>(defaultWakeSettings);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [isManualAlarmOpen, setIsManualAlarmOpen] = useState(false);
  const [manualHour, setManualHour] = useState('');
  const [manualMinute, setManualMinute] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  useEffect(() => {
    initApp();
    return setupEventListeners();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retryPendingEscalations();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    wakeSettingsRef.current = wakeSettings;
  }, [wakeSettings]);

  useEffect(() => {
    return () => {
      if (cancelUndoTimer.current) clearTimeout(cancelUndoTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!confirmationPlan) return;

    successScale.setValue(0);
    successSpin.setValue(0);
    const checkAnimation = Animated.spring(successScale, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    });
    const ringAnimation = Animated.loop(
      Animated.timing(successSpin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    checkAnimation.start();
    ringAnimation.start();
    const timer = setTimeout(() => setConfirmationPlan(null), 1800);

    return () => {
      checkAnimation.stop();
      ringAnimation.stop();
      clearTimeout(timer);
    };
  }, [confirmationPlan, successScale, successSpin]);

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
    await retryPendingEscalations();
  };

  const refreshState = async () => {
    try {
      const [read, scheduled, evts, history] = await Promise.all([
        Bridge.getWakeReadiness(),
        Bridge.getScheduledPlans(),
        Bridge.getUpcomingEvents(24 * 7),
        Bridge.getRecentWakeHistory(),
      ]);
      setReadiness(read);
      setScheduledPlans(scheduled);
      setActivePlan(scheduled[0] ?? null);
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
      void sendOrQueueEscalation(
        data.planId,
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

  const sendOrQueueEscalation = async (planId: string, planTitle: string, message: string) => {
    const result = await sendTelegramEscalation(planTitle, message);
    if (!result.ok) await Bridge.queueEscalation(planId, planTitle, message);
  };

  const retryPendingEscalations = async () => {
    if (escalationRetryInFlight.current) return;
    escalationRetryInFlight.current = true;
    try {
      const pending = await Bridge.getPendingEscalations();
      for (const entry of pending) {
        const result = await sendTelegramEscalation(entry.planTitle, entry.message);
        await Bridge.resolvePendingEscalation(entry.id, result.ok);
      }
    } finally {
      escalationRetryInFlight.current = false;
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
      setConfirmationPlan(plan);
    } catch (err: any) {
      Alert.alert('Scheduling Error', err.message || 'Could not schedule alarm.');
    }
  };

  const handleRejectPlan = async (plan: WakePlan) => {
    try {
      await Bridge.savePlanFeedback(plan.id, 'REJECTED', adjustNote);
      setDraftPlan(null);
      setAdjustNote('');
    } catch (err: any) {
      Alert.alert('Plan Error', err.message || 'Could not close this plan.');
    }
  };

  const handleCancelActivePlan = async (plan: WakePlan) => {
    try {
      await Bridge.cancelPlan(plan.id);
      setRecentlyCancelledPlan(plan);
      if (cancelUndoTimer.current) clearTimeout(cancelUndoTimer.current);
      cancelUndoTimer.current = setTimeout(() => setRecentlyCancelledPlan(null), 6_000);
      await refreshState();
    } catch (err: any) {
      Alert.alert('Alarm Error', err.message || 'Could not turn off this alarm.');
    }
  };

  const restoreCancelledPlan = async () => {
    const plan = recentlyCancelledPlan;
    if (!plan) return;
    try {
      await Bridge.saveAndSchedulePlan(plan);
      setRecentlyCancelledPlan(null);
      if (cancelUndoTimer.current) clearTimeout(cancelUndoTimer.current);
      await refreshState();
    } catch (err: any) {
      Alert.alert('Alarm Error', err.message || 'Could not turn this alarm back on.');
    }
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
    } catch (err: any) {
      Alert.alert('Settings Error', err.message || 'Could not save wake settings.');
    }
  };

  const handleTriggerDemo = async () => {
    const delaySeconds = 5;
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

  const openManualAlarm = () => {
    const now = new Date();
    setManualHour(String(now.getHours()).padStart(2, '0'));
    setManualMinute(String(now.getMinutes()).padStart(2, '0'));
    setManualLabel('');
    setIsManualAlarmOpen(true);
  };

  const handleCreateManualAlarm = async () => {
    if (!/^\d{1,2}$/.test(manualHour) || !/^\d{1,2}$/.test(manualMinute)) {
      Alert.alert('Choose a time', 'Enter an hour and minute.');
      return;
    }
    if (manualLabel.trim().length > 80) {
      Alert.alert('Alarm name is too long', 'Use up to 80 characters.');
      return;
    }
    try {
      const plan = createManualWakePlan(Number(manualHour), Number(manualMinute), manualLabel);
      if (!(await ensureAlarmPermissions())) return;
      await Bridge.saveAndSchedulePlan(plan);
      setIsManualAlarmOpen(false);
      setActiveTab('alarms');
      await refreshState();
      setConfirmationPlan(plan);
    } catch (err: any) {
      Alert.alert('Alarm Error', err.message || 'Could not create this alarm.');
    }
  };

  const handlePickManualTime = async () => {
    try {
      const picked = await Bridge.pickAlarmTime(Number(manualHour), Number(manualMinute));
      setManualHour(String(picked.hour).padStart(2, '0'));
      setManualMinute(String(picked.minute).padStart(2, '0'));
    } catch (err: any) {
      Alert.alert('Time picker', err.message || 'Could not open the time picker.');
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
        <CopilotWakeContext plan={draftPlan} settings={wakeSettings} />
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image
                source={require('./assets/branding/wake-me-up-favicon.png')}
                style={styles.logo}
              />
              <Text style={styles.appName} adjustsFontSizeToFit numberOfLines={1}>
                Wake Me Up
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={openManualAlarm}
              accessibilityLabel="Add alarm"
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'home' && (
            <>
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
                  onReject={(plan) => setRejectingPlan(plan)}
                />
              )}
              {!draftPlan && activePlan && (
                <WakePlanCard
                  plan={activePlan}
                  isDraft={false}
                  onApprove={() => {}}
                  onReject={() => {}}
                  onCancel={handleCancelActivePlan}
                />
              )}
              <CalendarList
                events={events}
                isPlanning={isProcessing}
                onRefresh={refreshState}
                onGeneratePlan={handleGeneratePlan}
              />
              <WakeReadinessCard readiness={readiness} />
            </>
          )}

          {activeTab === 'alarms' && (
            <>
              <View style={styles.screenHeading}>
                <Text style={styles.screenTitle}>Alarms</Text>
                <Text style={styles.screenDetail}>Tap + to add one</Text>
              </View>
              {scheduledPlans.length ? (
                scheduledPlans.map((plan) => (
                  <WakePlanCard
                    key={plan.id}
                    plan={plan}
                    isDraft={false}
                    onApprove={() => {}}
                    onReject={() => {}}
                    onCancel={handleCancelActivePlan}
                  />
                ))
              ) : (
                <TouchableOpacity style={styles.emptyScreen} onPress={openManualAlarm}>
                  <Text style={styles.emptyScreenTitle}>No alarms set</Text>
                  <Text style={styles.emptyScreenAction}>Add an alarm</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {activeTab === 'recent' && (
            <>
              <View style={styles.screenHeading}>
                <Text style={styles.screenTitle}>Recent</Text>
              </View>
              {wakeHistory.length ? (
                <View style={styles.historyCard}>
                  {wakeHistory.map((entry) => (
                    <View
                      key={`${entry.wakePlanId}-${entry.alarmTriggeredAt}`}
                      style={styles.historyEntry}
                    >
                      <View style={styles.historyEntryTop}>
                        <Text style={styles.historyEvent} numberOfLines={1}>
                          {entry.eventTitle}
                        </Text>
                        <Text
                          style={[
                            styles.historyStatus,
                            entry.success ? styles.historySuccess : styles.historyFailed,
                          ]}
                        >
                          {entry.success ? 'Verified' : 'Missed'}
                        </Text>
                      </View>
                      <Text style={styles.historyMeta}>
                        {new Date(entry.alarmTriggeredAt).toLocaleDateString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        ·{' '}
                        {new Date(entry.alarmTriggeredAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <Text style={styles.historyDetail}>
                        {entry.success
                          ? `${entry.verificationMethod === 'QR' || entry.qrUsed ? 'QR scan' : `${entry.stepsObserved} steps`} · ${entry.attemptCount} ${entry.attemptCount === 1 ? 'attempt' : 'attempts'}`
                          : `${entry.stepsObserved} steps · verification timed out`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyScreen}>
                  <Text style={styles.emptyScreenTitle}>No wake history yet</Text>
                </View>
              )}
            </>
          )}

          {activeTab === 'settings' && (
            <View style={styles.settingsCard}>
              <Text style={styles.screenTitle}>Settings</Text>
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
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSubmit, styles.settingsSave]}
                onPress={saveSettings}
              >
                <Text style={styles.modalSubmitText}>Save settings</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'demo' && (
            <DemoModeCard onTriggerDemo={handleTriggerDemo} isTriggering={isProcessing} />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => {
                if (tab.id === 'settings') setSettingsDraft(wakeSettings);
                setActiveTab(tab.id);
              }}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab === tab.id }}
            >
              <FooterIcon icon={tab.icon} active={activeTab === tab.id} />
            </TouchableOpacity>
          ))}
        </View>

        {recentlyCancelledPlan && (
          <View style={styles.snackbar}>
            <Text style={styles.snackbarText}>Alarm off</Text>
            <TouchableOpacity onPress={restoreCancelledPlan}>
              <Text style={styles.snackbarAction}>Undo</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={!!confirmationPlan}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmationPlan(null)}
        >
          <View style={styles.successOverlay} accessibilityLiveRegion="polite">
            <View style={styles.successMark}>
              <Animated.View
                style={[
                  styles.successOrbit,
                  {
                    transform: [
                      {
                        rotate: successSpin.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[styles.successCheck, { transform: [{ scale: successScale }] }]}
              >
                <Text style={styles.successCheckText}>✓</Text>
              </Animated.View>
            </View>
            <Text style={styles.successTitle}>Alarm set</Text>
            <Text style={styles.successDetail} numberOfLines={1}>
              {confirmationPlan
                ? new Date(confirmationPlan.firstAlarmAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </Text>
          </View>
        </Modal>

        <Modal
          visible={!!rejectingPlan}
          transparent
          animationType="slide"
          onRequestClose={() => setRejectingPlan(null)}
        >
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Change this plan?</Text>
              <Text style={styles.sheetDetail}>{rejectingPlan?.eventTitle}</Text>
              <TouchableOpacity
                style={styles.sheetPrimary}
                onPress={() => {
                  setRejectingPlan(null);
                  setIsAdjustModalOpen(true);
                }}
              >
                <Text style={styles.sheetPrimaryText}>Revise plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetSecondary}
                onPress={() => {
                  const plan = rejectingPlan;
                  setRejectingPlan(null);
                  if (plan) void handleRejectPlan(plan);
                }}
              >
                <Text style={styles.sheetSecondaryText}>Close plan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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

        <Modal
          visible={isManualAlarmOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsManualAlarmOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New alarm</Text>
              <TouchableOpacity
                style={styles.manualTimePicker}
                onPress={handlePickManualTime}
                accessibilityLabel="Choose alarm time"
              >
                <Text style={styles.manualTime}>{formatManualTime(manualHour, manualMinute)}</Text>
                <Text style={styles.manualTimeHint}>Tap to choose · rings once</Text>
              </TouchableOpacity>
              <View style={styles.manualFeature}>
                <Text style={styles.manualFeatureTitle}>Wake check</Text>
                <Text style={styles.manualFeatureDetail}>15 steps · QR if needed</Text>
              </View>
              <Text style={styles.inputLabel}>Alarm name</Text>
              <TextInput
                style={styles.input}
                value={manualLabel}
                onChangeText={setManualLabel}
                maxLength={80}
                placeholder="Alarm"
                placeholderTextColor="#778074"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSubmit]}
                  onPress={handleCreateManualAlarm}
                >
                  <Text style={styles.modalSubmitText}>Set alarm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalClose]}
                  onPress={() => setIsManualAlarmOpen(false)}
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

export default function App() {
  const [runtimeUrl, setRuntimeUrl] = useState('http://localhost:3000/api/copilotkit');

  useEffect(() => {
    void Bridge.getAgentServerUrl().then((url) =>
      setRuntimeUrl(`${url.replace(/\/+$/, '')}/api/copilotkit`),
    );
  }, []);

  return (
    <CopilotKitProvider runtimeUrl={runtimeUrl} useSingleEndpoint={false}>
      <WakeMeUpApp />
    </CopilotKitProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141914',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 108,
    width: '100%',
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
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -1,
    flexShrink: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  logo: {
    width: 30,
    height: 30,
    marginRight: 9,
  },
  addButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#f0a36d',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  addButtonText: {
    color: '#f0a36d',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 31,
  },
  screenHeading: {
    marginBottom: 16,
  },
  screenTitle: {
    color: '#fff9f0',
    fontFamily: 'serif',
    fontSize: 32,
    fontWeight: '800',
  },
  screenDetail: {
    color: '#a6afa3',
    fontSize: 14,
    marginTop: 4,
  },
  emptyScreen: {
    borderWidth: 1,
    borderColor: '#3a443b',
    borderRadius: 22,
    padding: 22,
  },
  emptyScreenTitle: {
    color: '#f5efe6',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyScreenAction: {
    color: '#f0a36d',
    fontSize: 14,
    marginTop: 6,
  },
  settingsCard: {
    backgroundColor: '#202821',
    borderColor: '#4a554a',
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  historyCard: {
    gap: 10,
  },
  historyEntry: {
    backgroundColor: '#202821',
    borderColor: '#374538',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  historyEntryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  historyEvent: { color: '#f5efe6', flex: 1, fontSize: 16, fontWeight: '800' },
  historyStatus: { fontSize: 12, fontWeight: '800' },
  historySuccess: { color: '#8fcb9f' },
  historyFailed: { color: '#f0a36d' },
  historyMeta: { color: '#a6afa3', fontSize: 13, marginTop: 5 },
  historyDetail: {
    color: '#d8ded4',
    fontSize: 13,
    marginTop: 9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12,15,12,0.86)',
    justifyContent: 'center',
    padding: 24,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12,15,12,0.58)',
    justifyContent: 'flex-end',
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12,15,12,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successOrbit: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 4,
    borderColor: 'rgba(95, 205, 132, 0.2)',
    borderTopColor: '#62cb87',
    borderRightColor: '#62cb87',
  },
  successCheck: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#4cab70',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#62cb87',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  successCheckText: {
    color: '#f6fbf4',
    fontSize: 39,
    fontWeight: '800',
    lineHeight: 46,
    marginTop: -2,
  },
  successTitle: {
    color: '#f5efe6',
    fontFamily: 'serif',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 22,
  },
  successDetail: {
    color: '#b7c3b5',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  snackbar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 86,
    backgroundColor: '#f5efe6',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 6,
  },
  snackbarText: {
    color: '#1f2621',
    fontSize: 15,
    fontWeight: '700',
  },
  snackbarAction: {
    color: '#e5583d',
    fontSize: 15,
    fontWeight: '800',
  },
  sheet: {
    backgroundColor: '#f5efe6',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 34,
  },
  sheetKicker: {
    color: '#776f65',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sheetTime: {
    color: '#1f2621',
    fontFamily: 'serif',
    fontSize: 48,
    fontWeight: '800',
    marginTop: 4,
  },
  sheetTitle: {
    color: '#1f2621',
    fontFamily: 'serif',
    fontSize: 32,
    fontWeight: '800',
  },
  sheetDetail: {
    color: '#776f65',
    fontSize: 15,
    marginTop: 5,
    marginBottom: 24,
  },
  sheetPrimary: {
    backgroundColor: '#e5583d',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 15,
  },
  sheetPrimaryText: {
    color: '#fff9f0',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetSecondary: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  sheetSecondaryText: {
    color: '#776f65',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    backgroundColor: '#171d17',
    borderTopWidth: 1,
    borderTopColor: '#303a30',
    flexDirection: 'row',
    minHeight: 66,
    paddingVertical: 6,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  homeIcon: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 35,
  },
  historyIcon: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 32,
    transform: [{ translateY: -1 }],
  },
  historyIconFrame: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockFace: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  clockHourHand: {
    position: 'absolute',
    width: 2,
    height: 7,
    left: 10,
    top: 5,
    borderRadius: 1,
  },
  clockMinuteHand: {
    position: 'absolute',
    width: 7,
    height: 2,
    left: 11,
    top: 11,
    borderRadius: 1,
  },
  sliderIcon: {
    width: 28,
    gap: 5,
  },
  sliderRail: {
    height: 2,
    borderRadius: 1,
  },
  sliderKnob: {
    position: 'absolute',
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPlay: {
    marginLeft: 3,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
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
  manualTimePicker: {
    alignItems: 'center',
    backgroundColor: '#141914',
    borderColor: '#5b7660',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 14,
    paddingVertical: 18,
  },
  manualTime: {
    color: '#fff9f0',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '800',
  },
  manualTimeHint: {
    color: '#a6afa3',
    fontSize: 13,
    marginTop: 3,
  },
  manualFeature: {
    borderBottomColor: '#364138',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 14,
  },
  manualFeatureTitle: {
    color: '#d8ded4',
    fontSize: 14,
    fontWeight: '800',
  },
  manualFeatureDetail: {
    color: '#a6afa3',
    fontSize: 13,
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
  settingsSave: {
    flex: 0,
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
