# Wake Me Up — Implementation Handoff

## 1. Project

**Name:** Wake Me Up
**Hackathon:** AI Tinkerers — Agents, Everywhere

### Product definition

> **Wake Me Up is a schedule-aware mobile agent that converts upcoming commitments into an approved wake plan, executes that plan using native Android alarm mechanisms, and verifies that the user has actually started their morning using simple physical evidence such as steps or QR verification.**

Core philosophy:

> **AI for judgment. Deterministic systems for reliability.**

The product is not just an AI alarm clock.

The agent reasons about **what tomorrow requires**. Android reliably executes the approved plan.

---

# 2. Problem

Existing alarms usually know only:

```text
Alarm triggered
→ user dismissed it
```

They do not know whether the user:

```text
dismissed alarm
→ got out of bed
```

or:

```text
dismissed alarm
→ immediately slept again
```

People also commonly:

* forget to create alarms for early commitments;
* select poor wake times;
* dismiss alarms and fall asleep again;
* forget to charge their phone;
* lose internet connectivity overnight.

Existing products such as Alarmy and Sleep as Android already provide:

* QR missions;
* step missions;
* math tasks;
* repeated alarms;
* wake-up checks.

We should **not compete by creating more wake-up challenges**.

Our differentiation is one layer above the alarm:

> **Upcoming commitments automatically become contextual wake objectives.**

---

# 3. User

Primary user:

> Someone with early commitments who sometimes dismisses alarms and falls asleep again.

Example:

```text
08:30 — University class
```

Instead of manually creating:

```text
07:15 alarm
```

Wake Me Up interprets the commitment and proposes:

```text
Wake objective: 07:20
First alarm: 07:15
Verification: 15 steps
Fallback: QR
```

---

# 4. Product Boundary

Wake Me Up solves:

> **Ensuring the user wakes in time for commitments that require waking.**

Do NOT turn it into:

* a full calendar app;
* a productivity assistant;
* a sleep-health application;
* a sleep-stage detector;
* a habit tracker;
* a general life agent;
* a smart-home system.

Calendar information is **context**, not the product.

---

# 5. Hackathon Thesis

The agent lives on the user's phone.

Because of that environment, it can access relevant context such as:

```text
upcoming commitments
alarm execution state
current time
step activity
QR verification
battery state
charging state
wake history
```

The strongest theme statement is:

> **The agent knows when the user needs to be awake because the commitment already exists on their phone, and the phone can verify whether their morning has actually started.**

---

# 6. Core Architecture Principle

Do NOT call an LLM continuously.

Do NOT poll an AI API every minute.

Architecture:

```text
AI
↓
plan / contextual judgment

Android
↓
execution / monitoring / verification
```

The agent should not handle operations that deterministic code handles better.

Examples that DO NOT require AI:

```text
steps >= 15
battery < 20%
QR successfully scanned
retryCount >= 2
network unavailable
```

---

# 7. Final Architecture

```text
                 REACT NATIVE
┌────────────────────────────────────┐
│ CopilotKit agent UI                │
│ Wake Plan review                   │
│ Approve / Adjust / Reject          │
│ Settings                           │
│ Wake history                       │
└──────────────────┬─────────────────┘
                   │
             Native bridge
                   │
                   ▼
             KOTLIN RUNTIME
┌────────────────────────────────────┐
│ CalendarContract.Instances         │
│ AlarmManager.setAlarmClock()       │
│ BroadcastReceiver                  │
│ WakeVerification ForegroundService │
│ SensorManager                      │
│ TYPE_STEP_COUNTER                  │
│ QR verification                    │
│ Notifications                      │
└──────────────────┬─────────────────┘
                   │
                   ▼
                  ROOM
            Local source of truth
```

AI planning path:

```text
React Native
    │
CopilotKit
    │
Copilot Runtime
    │
OpenAI
```

Important separation:

```text
ONLINE
AI Wake Plan generation

OFFLINE
Alarm execution
Step verification
QR verification
Retries
Wake outcome
```

If internet disappears during the night, the approved wake workflow must still work.

---

# 8. Technology Stack

## Frontend

**React Native**

Responsibilities:

* app screens;
* wake-plan review;
* settings;
* wake history;
* verification UI;
* readiness UI.

---

## Agent UI

**CopilotKit React Native**

Use for:

* agent interaction;
* contextual Wake Plan generation;
* human-in-the-loop review;
* structured approval/rejection flow.

Do NOT use CopilotKit as the runtime responsible for alarm correctness.

---

## AI

**OpenAI**

Primary responsibilities:

```text
interpret calendar context
generate Wake Plan
explain plan
incorporate user feedback
reason over recent wake history
recommend adjusted future plan
```

OpenRouter may be considered later as an optional fallback.

Do NOT implement multiple provider fallbacks unless necessary.

---

## Native Android Runtime

**Kotlin**

Kotlin owns all reliability-critical functionality:

```text
calendar querying
alarm scheduling
alarm triggering
step monitoring
foreground verification
wake execution state
notification lifecycle
local persistence integration
```

React Native must not own alarm correctness.

---

## Local Database

**Room**

Room is the authoritative durable source of truth for:

```text
WakePlan
WakeOutcome
WakePreferences
PlanFeedback
WakeExecutionState
TrustedContactConfig
```

Do NOT use:

```text
PostgreSQL
Redis
remote database
```

for the MVP.

---

## State Management

Do NOT add Redux or Zustand initially.

Use:

```text
React hooks
small React Context where necessary
native event subscriptions
```

Avoid multiple competing state stores.

Bad architecture:

```text
Room
+ Redux
+ React Query
+ CopilotKit state
```

---

## React Query / TanStack Query

Do NOT add for MVP.

Most application state is local:

```text
Room
Calendar Provider
AlarmManager
Android sensors
```

React Query primarily solves remote server-state problems, which we currently do not have.

Add later only if a real backend/query requirement emerges.

---

## SSE / WebSockets

Do NOT build custom SSE.

CopilotKit already handles agent communication.

Native runtime events should remain local:

```text
Kotlin
→ native event bridge
→ React Native
```

Examples:

```text
WAKE_PLAN_SCHEDULED
ALARM_TRIGGERED
VERIFYING
STEP_PROGRESS
QR_REQUIRED
VERIFIED
ESCALATED
```

---

# 9. Calendar Integration

Do NOT build a calendar.

Use:

**Android `CalendarContract.Instances`**

Reason:

Recurring calendar rules are unnecessarily complicated.

Query actual event occurrences instead of manually parsing recurrence rules.

For MVP, use a bounded lookahead window:

```text
now
→ approximately next 24 hours
```

or:

```text
evening
→ tomorrow afternoon
```

depending on the planning workflow.

Relevant event example:

```text
08:30 — Software Engineering
```

Irrelevant examples:

```text
12:00 workshop
19:00 dinner
all-day birthday
```

The product remains focused on commitments that require waking.

---

# 10. Event Eligibility

Do NOT automatically create wake plans for every calendar event.

MVP can use explicit/simple filtering.

Possible approaches:

```text
Wake Required = true
```

or a simple morning-window rule.

Long-term abstraction:

> Does this commitment occur after the user's expected sleep period?

Do NOT implement complex sleep prediction for the hackathon.

---

# 11. Wake Plan Generation

Agent input may include:

```text
calendar event
event start time
location type
preparation preference
travel preference
safety margin
recent wake outcomes
previous user feedback
```

Example:

```text
Event:
08:30 Software Engineering

Preparation:
20 min

Travel:
35 min

Safety margin:
10 min

Recent history:
07:20 wake required two retries twice
```

Agent proposal:

```text
WAKE PLAN

Wake objective:
07:15

First alarm:
07:10

Verification:
15 steps

Fallback:
QR

Reason:
35 min travel
20 min preparation
10 min safety margin
recent late wake verification
```

---

# 12. Human Review

For the hackathon MVP:

```text
[Approve]
[Adjust]
[Reject]
```

Explicit approval remains required.

Why:

* clearer demo;
* visible human control;
* shows CopilotKit HITL;
* avoids risky autonomous alarm scheduling;
* makes agent reasoning observable.

---

# 13. Auto-Approval Decision

Do NOT implement confidence-based auto-approval for MVP.

The idea is valid for a production version but creates unnecessary demo risk.

Future architecture may support:

```text
NORMAL PLAN
within historical norm
→ auto-schedule
→ passive notification

ANOMALOUS PLAN
e.g. 2 hours earlier
→ explicit approval
```

For hackathon:

> **All agent-generated Wake Plans require explicit approval.**

---

# 14. Reject / Adjustment Feedback

When a user rejects or modifies a Wake Plan, allow feedback.

Example:

```text
Agent:
Wake at 06:50

User:
Reject

Feedback:
"Too early. I only need 20 minutes to prepare."
```

Store:

```text
proposed_plan
user_decision
feedback
revised_plan
wake_outcome
```

This creates useful evaluation data.

Metrics later:

```text
plan acceptance rate
rejection rate
revision count
wake verification success
wake delay
retry count
verification method
```

Do NOT build a large evaluation platform.

---

# 15. Historical Adaptation

This is the preferred AI stretch feature.

Example:

```text
Monday
Alarm 07:20
1 attempt

Tuesday
Alarm 07:20
3 attempts
QR required

Wednesday
Alarm 07:20
3 attempts
QR required
```

Next plan:

```text
"Recent 07:20 wake plans required multiple retries.

Tomorrow's 08:30 class is important.

Recommended:
07:05 first alarm
07:15 wake objective
15-step verification."
```

This is legitimate contextual reasoning.

No custom ML training is required.

---

# 16. Wake Plan Approval Flow

```text
Agent proposes WakePlanDraft
        ↓
User reviews
        ↓
Approve
        ↓
Validate structured schema
        ↓
Persist to Room
        ↓
Native Kotlin scheduler receives WakePlan
        ↓
AlarmManager.setAlarmClock()
```

The LLM must never directly schedule an alarm.

---

# 17. Alarm Execution

Use:

**`AlarmManager.setAlarmClock()`**

Do NOT rely on:

* JavaScript timers;
* Expo background timers;
* periodic polling;
* WorkManager for exact wake timing.

High-level flow:

```text
Room WakePlan
     ↓
setAlarmClock()
     ↓
Android wakes device
     ↓
BroadcastReceiver
     ↓
Alarm Activity / service
```

---

# 18. Exact Alarm Permission

Do NOT blindly hard-code one permission approach.

Validate against:

* target Android SDK;
* hackathon APK installation method;
* device OS version.

Investigate the correct use of:

```text
USE_EXACT_ALARM
```

versus:

```text
SCHEDULE_EXACT_ALARM
```

The app's core functionality genuinely qualifies as alarm-clock behavior, but implementation must match current Android requirements.

---

# 19. Required Android Capabilities

Validate and request relevant permissions such as:

```text
ACTIVITY_RECOGNITION
POST_NOTIFICATIONS
FOREGROUND_SERVICE
FOREGROUND_SERVICE_HEALTH
exact-alarm permission where applicable
calendar read permission
```

Do not assume permission behavior.

Test on the actual demo device.

---

# 20. Wake Verification Runtime

After alarm dismissal:

```text
Alarm dismissed
↓
WakeVerificationService starts
↓
foreground notification shown
↓
step sensor listener registered
↓
verification timer starts
```

The service exists only during active verification.

Do NOT run a permanent foreground service.

---

# 21. Step Verification

Use:

**Android `TYPE_STEP_COUNTER`**

Flow:

```text
record baseline steps
↓
verification starts
↓
calculate delta
↓
delta >= configured threshold
↓
wake verified
```

Example:

```text
required steps = 15
```

Important:

Steps are **wake evidence**, not medical proof that the user is conscious.

If the device has no step-counter sensor:

```text
TYPE_STEP_COUNTER unavailable
→ QR becomes primary verification
```

---

# 22. QR Verification

QR is the strong fallback.

Example:

```text
insufficient step activity
↓
request QR
↓
user scans QR placed in bathroom
↓
wake verified
```

Do NOT add additional missions such as:

* math;
* squats;
* water recognition;
* camera object recognition.

QR + steps are enough.

---

# 23. Wake Verification State Machine

```text
SCHEDULED
    │
    ▼
ALARMING
    │
dismissed
    ▼
VERIFYING
    │
    ├── enough steps ──────► VERIFIED
    │
    ├── QR scan ───────────► VERIFIED
    │
    └── timeout
          │
          ▼
        RETRY
          │
          ▼
      ALARMING
```

After retry limit:

```text
unresolved
→ optional trusted-contact escalation
```

---

# 24. Trusted Contact Escalation

User may configure a trusted contact.

Possible flow:

```text
Alarm attempt 1
↓
no verification

Alarm attempt 2
↓
still no verification

retry threshold reached
↓
Telegram notification
```

Telegram logic is deterministic.

Example:

```text
IF wakeObjectiveUnresolved
AND retryCount >= configuredLimit
AND trustedContactEnabled

THEN sendTelegramAlert()
```

This is NOT an AI decision.

The agent must never choose arbitrary contacts.

---

# 25. Offline-First Execution

Morning execution must not require network access.

Must work offline:

```text
WakePlan
↓
Room
↓
AlarmManager
↓
ForegroundService
↓
Step sensor
↓
QR
↓
WakeOutcome
```

Network is only needed for:

```text
new AI plan generation
optional remote model calls
Telegram escalation
```

If Telegram cannot send:

```text
ESCALATION_PENDING_NETWORK
```

Wake execution continues.

---

# 26. Bedtime Wake Readiness

Before sleep, show a deterministic readiness check.

Example:

```text
WAKE READINESS

✓ Wake Plan approved
✓ Alarm scheduled
✓ Step sensor available
✓ Alarm capability ready
⚠ Battery 12%
⚠ Device not charging
```

Possible result:

```text
Wake Readiness: AT RISK
```

Message:

```text
Battery is low and the device is not charging.
Plug in your phone before sleeping.
```

Do NOT use AI for battery checking.

---

# 27. Network Readiness

Network failure should never invalidate the alarm.

Example:

```text
Internet:
Unavailable

Core wake workflow:
Ready offline

Trusted-contact escalation:
Unavailable until network returns
```

---

# 28. Room Data Model

Keep Room minimal.

## WakePlan

Suggested fields:

```text
id
calendarEventId
eventTitle
eventStart
wakeObjectiveAt
firstAlarmAt
requiredSteps
gracePeriodSeconds
retryLimit
qrFallbackEnabled
trustedContactEscalationEnabled
status
createdAt
approvedAt
reasoningSummary
```

---

## WakeOutcome

```text
id
wakePlanId
alarmTriggeredAt
firstDismissedAt
attemptCount
verifiedAt
verificationMethod
stepsObserved
qrUsed
escalated
success
```

---

## PlanFeedback

```text
id
wakePlanId
decision
feedback
createdAt
```

---

## WakePreferences

```text
prepMinutes
travelMinutes
safetyMarginMinutes
defaultRequiredSteps
defaultRetryLimit
telegramEnabled
```

---

# 29. Agent Tools

Keep agent tools narrow.

Potential read tools:

```text
get_upcoming_commitments()
get_wake_preferences()
get_recent_wake_history()
```

Potential planning actions:

```text
propose_wake_plan()
save_plan_feedback()
```

Approval should trigger deterministic native persistence/scheduling.

Do NOT expose unrestricted Android actions to the model.

---

# 30. Agent Output

Use structured WakePlan output.

Example:

```json
{
  "eventId": "...",
  "eventStart": "...",
  "wakeObjective": "...",
  "firstAlarm": "...",
  "verification": {
    "type": "steps",
    "requiredSteps": 15,
    "fallback": "qr"
  },
  "gracePeriodMinutes": 3,
  "retryLimit": 2,
  "trustedContactEscalation": false,
  "reasoningSummary": [
    "35 minute commute",
    "20 minute preparation",
    "10 minute safety margin"
  ]
}
```

Store only short user-visible reasoning.

Do NOT store model chain-of-thought.

---

# 31. Native-to-React Communication

Do NOT introduce custom SSE or WebSocket infrastructure.

Use a small native bridge/event layer.

Example:

```text
Kotlin
↓
Room / StateFlow
↓
native module events
↓
React Native UI
```

Relevant events:

```text
PLAN_SCHEDULED
ALARM_TRIGGERED
ALARM_DISMISSED
VERIFYING
STEP_PROGRESS
QR_REQUIRED
VERIFIED
RETRYING
ESCALATED
```

---

# 32. CopilotKit Responsibility

CopilotKit is used for:

```text
agent interaction
Wake Plan rendering
approval / rejection
feedback
context passing
```

It is NOT used for:

```text
background monitoring
exact alarms
sensor correctness
wake execution state
```

---

# 33. Backend Decision

Do NOT introduce:

```text
FastAPI
Contabo VPS
PostgreSQL
Redis
custom backend services
```

unless a concrete blocker requires them.

The calendar/plan context is tiny.

There is no meaningful LLM context-window problem.

If CopilotKit requires a runtime endpoint, use the minimum runtime necessary.

Do not turn it into a backend architecture project.

---

# 34. Model Fallback Decision

Primary:

**OpenAI**

Optional fallback:

**OpenRouter**, only if genuinely needed.

Do NOT build:

```text
OpenAI
+ OpenRouter
+ Vertex AI
```

for the hackathon.

Multiple providers add unnecessary failure modes.

---

# 35. Observability Decision

Do NOT integrate Sentry from minute one.

Use:

```text
Android Studio Logcat
adb logcat
structured local logs
```

first.

Add Sentry only if native bridge/runtime debugging becomes a serious blocker.

---

# 36. CI Decision

GitHub Actions is optional.

If implemented, keep it minimal:

```text
lint
typecheck
unit tests
Android build
```

Do not spend significant hackathon time on CI/CD polish before the end-to-end workflow works.

---

# 37. Why AI Is Required

Likely judge question:

> Why is this an AI agent rather than a normal alarm app?

Wrong answer:

```text
AI monitors my steps.
```

Steps do not require AI.

Correct answer:

> **Wake Me Up uses AI to interpret upcoming commitments, preparation requirements, user preferences, feedback and previous wake outcomes to construct an appropriate wake strategy. Once approved, Android executes that strategy deterministically.**

Simple architecture statement:

```text
AI:
What should tomorrow's wake plan be?

Android:
Execute it exactly.
```

---

# 38. Why Mobile Matters

A normal chat application does not naturally own:

```text
exact alarm execution
calendar device context
step-counter state
QR verification
charging state
battery state
mobile lifecycle
foreground verification
```

The environment is therefore essential rather than cosmetic.

---

# 39. Market Position

Do NOT claim wake verification itself is novel.

Products such as Alarmy and Sleep as Android already implement strong wake challenges.

Our differentiation:

```text
Existing alarm apps
→ user manually decides when/how to wake

Wake Me Up
→ upcoming commitments become contextual Wake Objectives
```

The innovation is the **planning layer**, not the step counter or QR mission.

---

# 40. Demo Mode

Real wake workflows take hours.

Implement a dedicated Demo Mode.

Do NOT contaminate production scheduling logic.

Example:

```text
Real mode:
Wake objective = tomorrow 07:20

Demo mode:
Wake objective = 60 seconds from now
```

---

# 41. Two-Minute Demo

## 0:00–0:20

Show calendar:

```text
08:30 Software Engineering
```

Agent reads context and creates:

```text
Wake objective: 07:20
First alarm: 07:15
Verification: 15 steps
```

User presses:

```text
Approve
```

---

## 0:20–0:40

Show:

```text
Wake Readiness

✓ Alarm scheduled
✓ Step sensor available
✓ Battery sufficient
```

Trigger compressed Demo Mode.

---

## 0:40–1:00

Alarm rings.

Dismiss.

Show:

```text
Wake objective unresolved

Steps:
0 / 15
```

---

## 1:00–1:20

Walk.

Display:

```text
15 / 15

WAKE VERIFIED
```

---

## 1:20–1:40

Show alternative failure branch:

```text
No verification
↓
second alarm
↓
still unresolved
↓
trusted-contact escalation
```

This branch may be safely demo-simulated if necessary.

---

## 1:40–2:00

Explain:

> **AI plans. The user approves. Android executes. Sensors verify.**

Then:

> **The user never manually created the alarm. The commitment already existed on the phone.**

---

# 42. MVP Implementation Priority

Implement in this order:

1. Native Android project/runtime foundation.
2. `CalendarContract.Instances` query.
3. Room schema.
4. WakePlan schema.
5. OpenAI/CopilotKit Wake Plan generation.
6. Approve / Adjust / Reject UI.
7. Persist approved Wake Plan.
8. `AlarmManager.setAlarmClock()`.
9. Alarm UI.
10. Foreground WakeVerificationService.
11. `TYPE_STEP_COUNTER`.
12. Wake outcome persistence.
13. Demo Mode.
14. QR fallback.
15. Wake Readiness screen.
16. Feedback/rejection storage.
17. Telegram escalation.
18. Historical plan adaptation.

Critical vertical slice:

```text
Calendar
→ Agent
→ Wake Plan
→ Approval
→ Room
→ Alarm
→ Step verification
→ Verified
```

Do not move to stretch features until this works reliably.

---

# 43. Explicit Non-Goals

Do NOT implement during MVP:

```text
custom calendar
general calendar assistant
sleep-stage prediction
health diagnosis
wearables
RAG
vector database
multi-agent architecture
continuous LLM polling
voice agent
smart-home integration
GPS commute prediction
complex family accounts
custom SSE
Redux
Zustand
React Query
FastAPI
PostgreSQL
Redis
Vertex AI fallback
permanent foreground service
```

---

# 44. Implementation Questions to Validate Early

The coding agent should validate these immediately:

1. Exact current Android behavior for `AlarmManager.setAlarmClock()`.
2. Appropriate exact-alarm permission strategy:

   * `USE_EXACT_ALARM`
   * vs `SCHEDULE_EXACT_ALARM`.
3. Target SDK impact.
4. Foreground-service requirements for active wake verification.
5. Step counter availability on the demo device.
6. `ACTIVITY_RECOGNITION` permission behavior.
7. Notification permission behavior.
8. Calendar read permission.
9. `CalendarContract.Instances` query correctness.
10. Native React Native/Kotlin bridge approach.
11. QR scanner compatibility.
12. CopilotKit React Native compatibility with the chosen native setup.
13. How Demo Mode remains isolated from production scheduling.

Use official Android, OpenAI and CopilotKit documentation as authoritative references.

---

# 45. Hackathon Resources

Review:

* AI Tinkerers — Agents, Everywhere official challenge page.
* `CopilotKit/agents-everywhere-starter-kit`
* `hackathon-overview.md`
* `hackathon-rules.md`
* `SUBMISSION.md`
* `using-sponsor-tools.md`
* React Native starter documentation.
* CopilotKit React Native documentation.
* OpenAI Agents / current agent API documentation.
* Android `AlarmManager` documentation.
* Android Doze/exact-alarm documentation.
* Android Foreground Service documentation.
* Android Sensors documentation.
* Android `TYPE_STEP_COUNTER`.
* Android `CalendarContract.Instances`.
* Android Room documentation.

Important rules:

* Project must be net-new during the hackathon.
* Existing templates/libraries are allowed.
* Be able to distinguish inherited and event-built code.
* One complete interaction is more important than broad scope.
* Sponsor count is not itself a judging criterion.

---

# 46. Final Engineering Principles

### 1. Environment must matter

The phone is not just where the UI happens.

It provides:

```text
calendar
alarms
steps
QR
battery
charging
execution lifecycle
```

---

### 2. AI must have a legitimate job

Use AI for:

```text
context interpretation
Wake Plan generation
user-feedback incorporation
historical adaptation
```

Do not use it for simple conditions.

---

### 3. Android owns reliability

If React Native crashes or the network disappears, an approved alarm must still function.

---

### 4. Offline critical path

Morning wake execution must remain local.

---

### 5. Human control first

For MVP, Wake Plans require explicit approval.

---

### 6. Minimize infrastructure

Every additional framework or service must justify its existence.

---

### 7. Build one complete vertical slice

The project succeeds if this is real:

```text
Calendar commitment
        ↓
Agent Wake Plan
        ↓
Human approval
        ↓
Native Android alarm
        ↓
Step verification
        ↓
Wake objective satisfied
```

Everything else is secondary.
