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

  async getActivePlan(): Promise<WakePlan | null> {
    if (!WakeMeUpModule) return null;
    return await WakeMeUpModule.getActivePlan();
  }

  async triggerDemoAlarm(delaySeconds = 15): Promise<{ id: string; firstAlarmAt: number }> {
    if (!WakeMeUpModule) throw new Error('Native module unavailable');
    return await WakeMeUpModule.triggerDemoAlarm(delaySeconds);
  }

  async cancelPlan(planId: string): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.cancelPlan(planId);
  }

  async verifyQrCode(scannedCode: string, expectedCode: string, planId: string): Promise<boolean> {
    if (!WakeMeUpModule) return false;
    return await WakeMeUpModule.verifyQrCode(scannedCode, expectedCode, planId);
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
}

export const Bridge = new WakeMeUpBridge();
