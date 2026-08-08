import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { TimelineStep } from '@/data/demo';
import { recordAnalyticsEvent } from '@/lib/analytics';
import { loadAppSettings } from '@/lib/app-settings';
import { scheduleConfirmedPlanStart } from '@/lib/confirmed-plan-notification-service';
import {
  addConfirmedPlan,
  confirmSchedulePlan,
  ConfirmedSchedulePlan,
  findDueConfirmedPlan,
  loadConfirmedPlans,
  markConfirmedPlanState,
  saveConfirmedPlans,
} from '@/lib/confirmed-plans';
import {
  clearScheduleDraft,
  createDefaultScheduleDraft,
  loadScheduleDraft,
  saveScheduleDraft,
  ScheduleDraft,
  ScheduleDraftStep,
} from '@/lib/schedule-draft';
import { createSchedulePlan, currentClock, SchedulePlan } from '@/lib/planning';
import {
  clearPersonalizationProfile,
  createDefaultPersonalizationProfile,
  createPlanPersonalization,
  learnFromCompletedSession,
  loadPersonalizationProfile,
  PersonalizationProfile,
  savePersonalizationProfile,
} from '@/lib/personalization';
import {
  cancelProgressNotifications,
  ProgressNotificationSyncResult,
  ProgressNotificationStatus,
  replaceProgressNotifications,
} from '@/lib/notification-service';
import {
  advanceProgressSession,
  applyProgressDelayProposal,
  clearProgressSession,
  createProgressDelayProposal,
  createProgressSession,
  loadProgressSession,
  ProgressDelayProposal,
  ProgressSession,
  saveProgressSession,
  updateProgressRoute,
} from '@/lib/progress-session';

type ScheduleContextValue = {
  timeline: TimelineStep[];
  delayMinutes: number;
  route: string;
  draft: ScheduleDraft;
  activeSchedule: ScheduleDraft | null;
  activePlan: SchedulePlan | null;
  pendingSchedule: ScheduleDraft | null;
  pendingPlan: SchedulePlan | null;
  confirmedPlans: ConfirmedSchedulePlan[];
  confirmedPlansStatus: 'loading' | 'saving' | 'saved' | 'error';
  draftStatus: 'loading' | 'saving' | 'saved' | 'error';
  progressSession: ProgressSession | null;
  pendingDelayProposal: ProgressDelayProposal | null;
  progressStatus: 'loading' | 'saving' | 'saved' | 'error';
  notificationStatus: ProgressNotificationStatus;
  personalizationProfile: PersonalizationProfile;
  personalizationStatus: 'loading' | 'saving' | 'saved' | 'error';
  lastPersonalizationLearnedCount: number;
  startProgress: (source?: 'notification' | 'direct' | 'auto', confirmedPlanId?: string) => Promise<void>;
  proposeDelay: (minutes: number) => void;
  applyDelayProposal: () => Promise<void>;
  rejectDelayProposal: () => void;
  completeCurrent: () => Promise<void>;
  applyRoute: (route: string) => Promise<void>;
  updateDraft: (values: Partial<ScheduleDraft>) => void;
  setDraftStep: (step: ScheduleDraftStep) => void;
  beginDraft: (reset?: boolean) => void;
  beginDraftWith: (values: Partial<ScheduleDraft>) => void;
  finalizeDraft: () => Promise<void>;
  finalizeDraftWith: (schedule: ScheduleDraft) => Promise<void>;
  confirmPendingPlan: () => Promise<ConfirmedSchedulePlan>;
  selectConfirmedPlan: (id: string) => void;
  useStandardPlan: () => void;
  setPersonalizationEnabled: (enabled: boolean) => Promise<void>;
  resetPersonalization: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export function ScheduleProvider({ children }: PropsWithChildren) {
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [delayMinutes, setDelayMinutes] = useState(6);
  const [route, setRoute] = useState('지하철');
  const [draft, setDraft] = useState(createDefaultScheduleDraft);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleDraft | null>(null);
  const [activePlan, setActivePlan] = useState<SchedulePlan | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<ScheduleDraft | null>(null);
  const [pendingPlan, setPendingPlan] = useState<SchedulePlan | null>(null);
  const [confirmedPlans, setConfirmedPlans] = useState<ConfirmedSchedulePlan[]>([]);
  const [confirmedPlansStatus, setConfirmedPlansStatus] = useState<ScheduleContextValue['confirmedPlansStatus']>('loading');
  const [progressSession, setProgressSession] = useState<ProgressSession | null>(null);
  const [pendingDelayProposal, setPendingDelayProposal] = useState<ProgressDelayProposal | null>(null);
  const [progressStatus, setProgressStatus] = useState<ScheduleContextValue['progressStatus']>('loading');
  const [notificationStatus, setNotificationStatus] = useState<ProgressNotificationStatus>('idle');
  const [personalizationProfile, setPersonalizationProfile] = useState(createDefaultPersonalizationProfile);
  const [personalizationStatus, setPersonalizationStatus] = useState<ScheduleContextValue['personalizationStatus']>('loading');
  const [lastPersonalizationLearnedCount, setLastPersonalizationLearnedCount] = useState(0);
  const [draftPhase, setDraftPhase] = useState<'loading' | 'editing' | 'finalized'>('loading');
  const [draftStatus, setDraftStatus] = useState<ScheduleContextValue['draftStatus']>('loading');
  const draftWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const draftWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newDraftRequested = useRef(false);
  const draftRequestGeneration = useRef(0);
  const progressSessionRef = useRef<ProgressSession | null>(null);
  const confirmedPlansRef = useRef<ConfirmedSchedulePlan[]>([]);
  const confirmedPlansWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const personalizationRef = useRef(personalizationProfile);
  const progressWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const notificationWriteQueue = useRef<Promise<ProgressNotificationSyncResult | {
    session: null;
    status: 'error';
  }>>(Promise.resolve({
    session: null,
    status: 'error' as const,
  }));
  const notificationGeneration = useRef(0);
  const applyPersonalizationProfile = useCallback((profile: PersonalizationProfile) => {
    personalizationRef.current = profile;
    setPersonalizationProfile(profile);
  }, []);
  const createCurrentPlan = useCallback((schedule: ScheduleDraft) => createSchedulePlan(schedule, {
    now: currentClock(),
    personalization: createPlanPersonalization(personalizationRef.current, schedule),
  }), []);
  const startNewDraft = useCallback((values: Partial<ScheduleDraft> = {}) => {
    const generation = ++draftRequestGeneration.current;
    const commonDraft = createDefaultScheduleDraft();
    const initialRoutines = commonDraft.routines;
    setPendingSchedule(null);
    setPendingPlan(null);
    setDraft({ ...commonDraft, ...values, step: 0 });
    setDraftStatus('saving');
    setDraftPhase('editing');
    if (values.routines) return;
    void loadAppSettings(AsyncStorage)
      .then((settings) => {
        if (draftRequestGeneration.current !== generation) return;
        const recommendedRoutines = createDefaultScheduleDraft(settings.preparationGender).routines;
        setDraft((current) => {
          if (JSON.stringify(current.routines) !== JSON.stringify(initialRoutines)) return current;
          return { ...current, routines: recommendedRoutines };
        });
      })
      .catch(() => undefined);
  }, []);
  const beginDraft = useCallback((reset = false) => {
    if (reset) {
      void recordAnalyticsEvent(AsyncStorage, 'draft_started');
      newDraftRequested.current = true;
      startNewDraft();
      return;
    }
    setDraftPhase((phase) => phase === 'finalized' ? 'editing' : phase);
  }, [startNewDraft]);
  const applyProgressState = useCallback((session: ProgressSession | null) => {
    progressSessionRef.current = session;
    setProgressSession(session);
    if (!session) return;
    setActiveSchedule(session.schedule);
    setActivePlan(session.plan);
    setTimeline(session.timeline);
    setDelayMinutes(session.delayMinutes);
    setRoute(session.route);
  }, []);
  const applyConfirmedPlans = useCallback((plans: ConfirmedSchedulePlan[]) => {
    confirmedPlansRef.current = plans;
    setConfirmedPlans(plans);
    if (progressSessionRef.current?.state === 'active') return;
    const next = plans.find((plan) => plan.state === 'active')
      ?? plans.find((plan) => plan.state === 'scheduled')
      ?? [...plans].reverse().find((plan) => plan.state === 'completed');
    if (!next) return;
    setActiveSchedule(next.schedule);
    setActivePlan(next.plan);
    setTimeline(next.plan.timeline);
    setRoute(next.schedule.transport);
  }, []);
  const persistConfirmedPlans = useCallback((plans: ConfirmedSchedulePlan[]) => {
    setConfirmedPlansStatus('saving');
    confirmedPlansWriteQueue.current = confirmedPlansWriteQueue.current
      .catch(() => undefined)
      .then(() => saveConfirmedPlans(AsyncStorage, plans));
    confirmedPlansWriteQueue.current
      .then(() => setConfirmedPlansStatus('saved'))
      .catch(() => setConfirmedPlansStatus('error'));
    return confirmedPlansWriteQueue.current;
  }, []);
  const commitConfirmedPlans = useCallback(async (plans: ConfirmedSchedulePlan[]) => {
    applyConfirmedPlans(plans);
    await persistConfirmedPlans(plans);
  }, [applyConfirmedPlans, persistConfirmedPlans]);
  const persistProgress = useCallback((session: ProgressSession) => {
    setProgressStatus('saving');
    progressWriteQueue.current = progressWriteQueue.current
      .catch(() => undefined)
      .then(() => saveProgressSession(AsyncStorage, session));
    progressWriteQueue.current
      .then(() => setProgressStatus('saved'))
      .catch(() => setProgressStatus('error'));
    return progressWriteQueue.current;
  }, []);
  const removePersistedProgress = useCallback(() => {
    setProgressStatus('saving');
    progressWriteQueue.current = progressWriteQueue.current
      .catch(() => undefined)
      .then(() => clearProgressSession(AsyncStorage));
    progressWriteQueue.current
      .then(() => setProgressStatus('saved'))
      .catch(() => setProgressStatus('error'));
    return progressWriteQueue.current;
  }, []);

  const commitProgress = useCallback(async (session: ProgressSession) => {
    const generation = ++notificationGeneration.current;
    applyProgressState(session);
    await persistProgress(session);
    notificationWriteQueue.current = notificationWriteQueue.current
      .catch(() => ({ session: null, status: 'error' as const }))
      .then(() => replaceProgressNotifications(session));
    const result = await notificationWriteQueue.current;
    if (!result.session) return;
    if (generation !== notificationGeneration.current) {
      await cancelProgressNotifications(result.session);
      return;
    }
    applyProgressState(result.session);
    await persistProgress(result.session);
    setNotificationStatus(result.status);
  }, [applyProgressState, persistProgress]);

  useEffect(() => {
    let active = true;

    loadScheduleDraft(AsyncStorage)
      .then((savedDraft) => {
        if (active && savedDraft && !newDraftRequested.current) setDraft(savedDraft);
      })
      .catch(() => {
        if (active) setDraftStatus('error');
      })
      .finally(() => {
        if (!active) return;
        setDraftPhase('editing');
        setDraftStatus((status) => status === 'error' ? 'error' : 'saved');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadProgressSession(AsyncStorage)
      .then(async (savedSession) => {
        if (active && savedSession?.state === 'active') await commitProgress(savedSession);
      })
      .catch(() => {
        if (active) setProgressStatus('error');
      })
      .finally(() => {
        if (active) setProgressStatus((status) => status === 'error' ? 'error' : 'saved');
      });

    return () => {
      active = false;
    };
  }, [commitProgress]);

  useEffect(() => {
    let active = true;
    loadConfirmedPlans(AsyncStorage)
      .then((plans) => {
        if (!active) return;
        applyConfirmedPlans(plans);
        setConfirmedPlansStatus('saved');
      })
      .catch(() => {
        if (active) setConfirmedPlansStatus('error');
      });
    return () => { active = false; };
  }, [applyConfirmedPlans]);

  useEffect(() => {
    let active = true;
    loadPersonalizationProfile(AsyncStorage)
      .then((profile) => {
        if (!active) return;
        applyPersonalizationProfile(profile);
        setPersonalizationStatus('saved');
      })
      .catch(() => {
        if (active) setPersonalizationStatus('error');
      });
    return () => { active = false; };
  }, [applyPersonalizationProfile]);

  useEffect(() => {
    if (draftPhase !== 'editing') return;

    draftWriteTimer.current = setTimeout(() => {
      draftWriteTimer.current = null;
      draftWriteQueue.current = draftWriteQueue.current
        .catch(() => undefined)
        .then(() => saveScheduleDraft(AsyncStorage, draft));
      draftWriteQueue.current
        .then(() => setDraftStatus('saved'))
        .catch(() => setDraftStatus('error'));
    }, 250);

    return () => {
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current);
      draftWriteTimer.current = null;
    };
  }, [draft, draftPhase]);

  const startProgress = useCallback(async (
    source: 'notification' | 'direct' | 'auto' = 'direct',
    confirmedPlanId?: string,
  ) => {
    if (progressStatus === 'loading') return;
    if (progressSessionRef.current?.state === 'active') {
      if (source === 'notification') void recordAnalyticsEvent(AsyncStorage, 'progress_started', { source });
      return;
    }
    const stored = confirmedPlanId
      ? confirmedPlansRef.current.find((item) => item.id === confirmedPlanId && item.state === 'scheduled') ?? null
      : findDueConfirmedPlan(confirmedPlansRef.current);
    if (!stored || stored.prepStartAt > Date.now()) return;
    const session = createProgressSession({
      schedule: stored.schedule,
      plan: stored.plan,
      confirmedPlanId: stored.id,
    });
    await commitConfirmedPlans(markConfirmedPlanState(confirmedPlansRef.current, stored.id, 'active'));
    await commitProgress(session);
    void recordAnalyticsEvent(AsyncStorage, 'progress_started', {
      source,
      scheduledNotifications: progressSessionRef.current?.scheduledNotifications.length ?? 0,
    });
  }, [commitConfirmedPlans, commitProgress, progressStatus]);

  useEffect(() => {
    if (confirmedPlansStatus === 'loading' || progressStatus === 'loading' || progressSession?.state === 'active') return;
    const next = confirmedPlans.find((plan) => plan.state === 'scheduled');
    if (!next) return;
    const startWhenDue = () => void startProgress('auto', next.id);
    const delay = Math.max(0, Math.min(next.prepStartAt - Date.now(), 2_147_000_000));
    const timer = setTimeout(startWhenDue, delay);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') startWhenDue();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [confirmedPlans, confirmedPlansStatus, progressSession?.state, progressStatus, startProgress]);

  const completeCurrent = useCallback(async () => {
    const current = progressSessionRef.current;
    if (!current) return;
    setPendingDelayProposal(null);
    const next = advanceProgressSession(current);
    const completedStep = next.timeline.find((step) => step.id === current.currentStepId);
    if (completedStep?.actualDurationMinutes) {
      void recordAnalyticsEvent(AsyncStorage, 'step_completed', {
        stepId: completedStep.id,
        plannedMinutes: completedStep.duration,
        actualMinutes: completedStep.actualDurationMinutes,
      });
    }
    if (next.state === 'completed') {
      void recordAnalyticsEvent(AsyncStorage, 'schedule_completed', {
        onTime: next.delayMinutes <= next.plan.bufferMinutes,
        delayMinutes: next.delayMinutes,
      });
      const learned = learnFromCompletedSession(personalizationRef.current, next);
      setLastPersonalizationLearnedCount(learned.learnedCount);
      if (learned.profile !== personalizationRef.current) {
        setPersonalizationStatus('saving');
        try {
          await savePersonalizationProfile(AsyncStorage, learned.profile);
          applyPersonalizationProfile(learned.profile);
          setPersonalizationStatus('saved');
        } catch {
          setPersonalizationStatus('error');
        }
      }
      if (current.confirmedPlanId) {
        await commitConfirmedPlans(markConfirmedPlanState(
          confirmedPlansRef.current,
          current.confirmedPlanId,
          'completed',
        ));
      }
    }
    await commitProgress(next);
  }, [applyPersonalizationProfile, commitConfirmedPlans, commitProgress]);

  const proposeDelay = useCallback((minutes: number) => {
    const current = progressSessionRef.current;
    if (!current) return;
    setPendingDelayProposal(createProgressDelayProposal(current, minutes));
    void recordAnalyticsEvent(AsyncStorage, 'delay_proposed', { minutes });
  }, []);

  const applyDelayProposal = useCallback(async () => {
    const current = progressSessionRef.current;
    if (!current || !pendingDelayProposal) return;
    const next = applyProgressDelayProposal(current, pendingDelayProposal);
    void recordAnalyticsEvent(AsyncStorage, 'delay_applied', { minutes: pendingDelayProposal.additionalMinutes });
    setPendingDelayProposal(null);
    await commitProgress(next);
  }, [commitProgress, pendingDelayProposal]);

  const rejectDelayProposal = useCallback(() => {
    if (pendingDelayProposal) {
      void recordAnalyticsEvent(AsyncStorage, 'delay_rejected', { minutes: pendingDelayProposal.additionalMinutes });
    }
    setPendingDelayProposal(null);
  }, [pendingDelayProposal]);

  const applyRoute = useCallback(async (nextRoute: string) => {
    setPendingDelayProposal(null);
    const current = progressSessionRef.current;
    if (!current && pendingSchedule) {
      const nextSchedule = { ...pendingSchedule, transport: nextRoute as ScheduleDraft['transport'] };
      const nextPlan = createCurrentPlan(nextSchedule);
      setPendingSchedule(nextSchedule);
      setPendingPlan(nextPlan);
      setTimeline(nextPlan.timeline);
      setRoute(nextRoute);
      return;
    }
    if (!current) {
      // A confirmed plan must never become active through a route change.
      // It will be started only by the scheduled-time checker.
      return;
    }
    const next = updateProgressRoute(current, nextRoute);
    await commitProgress(next);
  }, [commitProgress, createCurrentPlan, pendingSchedule]);

  const finalizeSchedule = useCallback(async (schedule: ScheduleDraft) => {
    const nextPlan = createCurrentPlan(schedule);
    setDraft(schedule);
    setPendingSchedule(schedule);
    setPendingPlan(nextPlan);
    setTimeline(nextPlan.timeline);
    setDraftPhase('finalized');
    try {
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current);
      draftWriteTimer.current = null;
      await draftWriteQueue.current.catch(() => undefined);
      await saveScheduleDraft(AsyncStorage, schedule);
      setDraftStatus('saved');
    } catch {
      setDraftStatus('error');
    }
    void recordAnalyticsEvent(AsyncStorage, 'draft_completed');
  }, [createCurrentPlan]);

  const value = useMemo<ScheduleContextValue>(() => ({
    timeline,
    delayMinutes,
    route,
    draft,
    activeSchedule,
    activePlan,
    pendingSchedule,
    pendingPlan,
    confirmedPlans,
    confirmedPlansStatus,
    draftStatus,
    progressSession,
    pendingDelayProposal,
    progressStatus,
    notificationStatus,
    personalizationProfile,
    personalizationStatus,
    lastPersonalizationLearnedCount,
    startProgress,
    proposeDelay,
    applyDelayProposal,
    rejectDelayProposal,
    completeCurrent,
    applyRoute,
    updateDraft(values) {
      setDraftStatus('saving');
      setDraft((current) => ({ ...current, ...values }));
    },
    setDraftStep(step) {
      setDraftStatus('saving');
      setDraft((current) => ({ ...current, step }));
    },
    beginDraft,
    beginDraftWith(values) {
      void recordAnalyticsEvent(AsyncStorage, 'draft_started');
      newDraftRequested.current = true;
      startNewDraft(values);
    },
    async finalizeDraft() {
      await finalizeSchedule(draft);
    },
    finalizeDraftWith: finalizeSchedule,
    async confirmPendingPlan() {
      if (!pendingSchedule || !pendingPlan) throw new Error('확정할 계획이 없습니다.');
      const confirmed = confirmSchedulePlan({ schedule: pendingSchedule, plan: pendingPlan });
      const notification = await scheduleConfirmedPlanStart(confirmed);
      const stored = notification.identifier
        ? { ...confirmed, notificationIdentifier: notification.identifier }
        : confirmed;
      await commitConfirmedPlans(addConfirmedPlan(confirmedPlansRef.current, stored));
      await clearScheduleDraft(AsyncStorage);
      setPendingSchedule(null);
      setPendingPlan(null);
      setNotificationStatus(notification.status);
      void recordAnalyticsEvent(AsyncStorage, 'draft_completed', { confirmed: true });
      return stored;
    },
    selectConfirmedPlan(id) {
      const selected = confirmedPlansRef.current.find((plan) => plan.id === id);
      if (!selected) return;
      setPendingSchedule(null);
      setPendingPlan(null);
      setActiveSchedule(selected.schedule);
      setActivePlan(selected.plan);
      setTimeline(selected.plan.timeline);
      setRoute(selected.schedule.transport);
    },
    useStandardPlan() {
      const schedule = pendingSchedule ?? activeSchedule ?? draft;
      const nextPlan = createSchedulePlan(schedule, { now: currentClock() });
      if (pendingSchedule) setPendingPlan(nextPlan);
      else setActivePlan(nextPlan);
      setTimeline(nextPlan.timeline);
    },
    async setPersonalizationEnabled(enabled) {
      const next = { ...personalizationRef.current, enabled };
      setPersonalizationStatus('saving');
      applyPersonalizationProfile(next);
      try {
        await savePersonalizationProfile(AsyncStorage, next);
        setPersonalizationStatus('saved');
      } catch {
        setPersonalizationStatus('error');
      }
    },
    async resetPersonalization() {
      const next = { ...createDefaultPersonalizationProfile(), enabled: personalizationRef.current.enabled };
      setPersonalizationStatus('saving');
      try {
        await clearPersonalizationProfile(AsyncStorage);
        if (!next.enabled) await savePersonalizationProfile(AsyncStorage, next);
        applyPersonalizationProfile(next);
        setLastPersonalizationLearnedCount(0);
        setPersonalizationStatus('saved');
      } catch {
        setPersonalizationStatus('error');
      }
    },
    async resetDemo() {
      const currentProgress = progressSessionRef.current;
      notificationGeneration.current += 1;
      await cancelProgressNotifications(currentProgress);
      setTimeline([]);
      setDelayMinutes(6);
      setRoute('지하철');
      setActivePlan(null);
      setActiveSchedule(null);
      setPendingPlan(null);
      setPendingSchedule(null);
      progressSessionRef.current = null;
      setProgressSession(null);
      setPendingDelayProposal(null);
      setProgressStatus('saved');
      await removePersistedProgress();
      await commitConfirmedPlans([]);
    },
  }), [activePlan, activeSchedule, applyDelayProposal, applyPersonalizationProfile, applyRoute, beginDraft, commitConfirmedPlans, completeCurrent, confirmedPlans, confirmedPlansStatus, delayMinutes, draft, draftStatus, finalizeSchedule, lastPersonalizationLearnedCount, notificationStatus, pendingDelayProposal, pendingPlan, pendingSchedule, personalizationProfile, personalizationStatus, progressSession, progressStatus, proposeDelay, rejectDelayProposal, removePersistedProgress, route, startNewDraft, startProgress, timeline]);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error('useSchedule must be used inside ScheduleProvider');
  return value;
}
