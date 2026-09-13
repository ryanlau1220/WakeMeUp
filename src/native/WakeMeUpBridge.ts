import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { WakeMeUpModule } = NativeModules;

if (!WakeMeUpModule && Platform.OS === 'android') {
  console.warn('WakeMeUpModule native module is not linked!');
}

export interface CalendarEvent {
  id: string;
  title: string;
  startMillis: number;
  endMillis: number;
  isAllDay: boolean;
  location: string;
  description: string;
}

export interface WakePlan {
  id: string;
  calendarEventId?: string;
  eventTitle: string;
  eventStart: number;
  wakeObjectiveAt: number;
  firstAlarmAt: number;
  requiredSteps: number;
  gracePeriodSeconds: number;
  retryLimit?: number;
  status?: string; // DRAFT, APPROVED, ALARMING, VERIFYING, VERIFIED, CANCELLED
  reasoningSummary?: string | string[];
}

export interface WakeReadiness {
  batteryLevel: number;
  isCharging: boolean;
  hasStepSensor: boolean;
  canScheduleExactAlarm: boolean;
  canUseFullScreenIntent: boolean;
  hasCalendarPermission: boolean;
  isReadyOffline: boolean;
}

export interface WakeHistoryItem {
  wakePlanId: string;
  eventTitle: string;
  alarmTriggeredAt: number;
  verifiedAt: number | null;
  attemptCount: number;
  stepsObserved: number;
  verificationMethod: string | null;
  qrUsed: boolean;
  success: boolean;
}

export interface PendingEscalation {
  id: string;
  wakePlanId: string;
  planTitle: string;
  message: string;
  attempts: number;
}

export interface WakeSettings {
  prepMinutes: number;
  travelMinutes: number;
  safetyMargin: number;
  qrCode: string;
  telegramEscalationEnabled: boolean;
}

export interface StepProgressEvent {
  planId: string;
  steps: number;
  requiredSteps: number;
}

export interface WakeVerifiedEvent {
  planId: string;
  steps: number;
  verificationMethod: 'STEPS' | 'QR';
}

class WakeMeUpBridge {
  private emitter: NativeEventEmitter | null = null;

  constructor() {
    if (WakeMeUpModule) {
      this.emitter = new NativeEventEmitter(WakeMeUpModule);
    }
  }

  async getUpcomingEvents(lookaheadHours = 24): Promise<CalendarEvent[]> {
    if (!WakeMeUpModule) return [];
    return await WakeMeUpModule.getUpcomingEvents(lookaheadHours);
  }

  async getAgentServerUrl(): Promise<string> {
    if (!WakeMeUpModule) return 'http://localhost:3000';
    return await WakeMeUpModule.getAgentServerUrl();
  }

  async getWakeSettings(): Promise<WakeSettings> {
    if (!WakeMeUpModule) {
      return {
        prepMinutes: 25,
        travelMinutes: 30,
        safetyMargin: 10,
        qrCode: 'WAKEMEUP_BATHROOM_QR',
        telegramEscalationEnabled: false,
      };
    }
    return await WakeMeUpModule.getWakeSettings();
  }

  async saveWakeSettings(settings: WakeSettings): Promise<void> {
    if (!WakeMeUpModule) return;
    await WakeMeUpModule.saveWakeSettings(
      settings.prepMinutes,
      settings.travelMinutes,
      settings.safetyMargin,
      settings.qrCode,
      settings.telegramEscalationEnabled,
    );
  }

  async getWakeReadiness(): Promise<WakeReadiness> {
    if (!WakeMeUpModule) {
      return {
        batteryLevel: 100,
        isCharging: true,
        hasStepSensor: true,
        canScheduleExactAlarm: true,
        canUseFullScreenIntent: true,
        hasCalendarPermission: false,
        isReadyOffline: true,
      };
    }
    return await WakeMeUpModule.getWakeReadiness();
  }

  async saveAndSchedulePlan(plan: WakePlan): Promise<{ id: string; status: string }> {
    if (!WakeMeUpModule) throw new Error('Native module unavailable');
    const formatted = {
      ...plan,
      reasoningSummary: Array.isArray(plan.reasoningSummary)
        ? JSON.stringify(plan.reasoningSummary)
        : plan.reasoningSummary || '',
    };
    return await WakeMeUpModule.saveAndSchedulePlan(formatted);
  }

  async requestExactAlarmPermission(): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.requestExactAlarmPermission();
  }

  async requestFullScreenIntentPermission(): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.requestFullScreenIntentPermission();
  }

  async savePlanFeedback(
    wakePlanId: string,
    decision: 'APPROVED' | 'ADJUSTED' | 'REJECTED',
    feedback = '',
  ): Promise<void> {
    if (!WakeMeUpModule) return;
    await WakeMeUpModule.savePlanFeedback(wakePlanId, decision, feedback);
  }

  async getRecentWakeHistory(limit = 10): Promise<WakeHistoryItem[]> {
    if (!WakeMeUpModule) return [];
    return await WakeMeUpModule.getRecentWakeHistory(limit);
  }

  async getActivePlan(): Promise<WakePlan | null> {
    if (!WakeMeUpModule) return null;
    return await WakeMeUpModule.getActivePlan();
  }

  async getScheduledPlans(): Promise<WakePlan[]> {
    if (!WakeMeUpModule) return [];
    return await WakeMeUpModule.getScheduledPlans();
  }

  async pickAlarmTime(hour: number, minute: number): Promise<{ hour: number; minute: number }> {
    if (!WakeMeUpModule) return { hour, minute };
    return await WakeMeUpModule.pickAlarmTime(hour, minute);
  }

  async cancelPlan(planId: string): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.cancelPlan(planId);
  }

  async queueEscalation(
    planId: string,
    planTitle: string,
    message: string,
  ): Promise<string | null> {
    if (!WakeMeUpModule) return null;
    return await WakeMeUpModule.queueEscalation(planId, planTitle, message);
  }

  async getPendingEscalations(limit = 10): Promise<PendingEscalation[]> {
    if (!WakeMeUpModule) return [];
    return await WakeMeUpModule.getPendingEscalations(limit);
  }

  async resolvePendingEscalation(id: string, delivered: boolean): Promise<void> {
    if (!WakeMeUpModule) return;
    await WakeMeUpModule.resolvePendingEscalation(id, delivered);
  }

  async verifyQrCode(scannedCode: string, expectedCode: string, planId: string): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.verifyQrCode(scannedCode, expectedCode, planId);
  }

  async scanQrCode(expectedCode: string, planId: string): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.scanQrCode(expectedCode, planId);
  }

  onAlarmTriggered(
    callback: (data: { planId: string; eventTitle: string; requiredSteps: number }) => void,
  ) {
    return this.emitter?.addListener('ALARM_TRIGGERED', callback as any);
  }

  onAlarmDismissed(callback: (data: { planId: string; requiredSteps: number }) => void) {
    return this.emitter?.addListener('ALARM_DISMISSED', callback as any);
  }

  onStepProgress(callback: (data: StepProgressEvent) => void) {
    return this.emitter?.addListener('STEP_PROGRESS', callback as any);
  }

  onWakeVerified(callback: (data: WakeVerifiedEvent) => void) {
    return this.emitter?.addListener('WAKE_VERIFIED', callback as any);
  }

  onQrRequired(
    callback: (data: { planId: string; stepsObserved: number; requiredSteps: number }) => void,
  ) {
    return this.emitter?.addListener('QR_REQUIRED', callback as any);
  }

  onEscalated(callback: (data: { planId: string; eventTitle: string }) => void) {
    return this.emitter?.addListener('ESCALATED', callback as any);
  }
}

export const Bridge = new WakeMeUpBridge();
