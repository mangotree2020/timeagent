import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { initialTimeline, TimelineStep } from '@/data/demo';
import { recordAnalyticsEvent } from '@/lib/analytics';
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
  draftStatus: 'loading' | 'saving' | 'saved' | 'error';
  progressSession: ProgressSession | null;
  pendingDelayProposal: ProgressDelayProposal | null;
  progressStatus: 'loading' | 'saving' | 'saved' | 'error';
  notificationStatus: ProgressNotificationStatus;
  personalizationProfile: PersonalizationProfile;
  personalizationStatus: 'loading' | 'saving' | 'saved' | 'error';
  lastPersonalizationLearnedCount: number;
  startProgress: (source?: 'plan' | 'notification' | 'direct') => Promise<void>;
  proposeDelay: (minutes: number) => void;
  applyDelayProposal: () => Promise<void>;
  rejectDelayProposal: () => void;
  completeCurrent: () => Promise<void>;
  applyRoute: (route: string) => Promise<void>;
  updateDraft: (values: Partial<ScheduleDraft>) => void;
  setDraftStep: (step: ScheduleDraftStep) => void;
  beginDraft: (reset?: boolean) => void;
  finalizeDraft: () => Promise<void>;
  useStandardPlan: () => void;
  setPersonalizationEnabled: (enabled: boolean) => Promise<void>;
  resetPersonalization: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export function ScheduleProvider({ children }: PropsWithChildren) {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [delayMinutes, setDelayMinutes] = useState(6);
  const [route, setRoute] = useState('지하철');
  const [draft, setDraft] = useState(createDefaultScheduleDraft);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleDraft | null>(null);
  const [activePlan, setActivePlan] = useState<SchedulePlan | null>(null);
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
  const progressSessionRef = useRef<ProgressSession | null>(null);
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
  const beginDraft = useCallback((reset = false) => {
    if (reset) {
      void recordAnalyticsEvent(AsyncStorage, 'draft_started');
      newDraftRequested.current = true;
      setDraft(createDefaultScheduleDraft());
      setDraftStatus('saving');
      setDraftPhase('editing');
      return;
    }
    setDraftPhase((phase) => phase === 'finalized' ? 'editing' : phase);
  }, []);
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

  const startProgress = useCallback(async (source: 'plan' | 'notification' | 'direct' = 'direct') => {
    if (progressStatus === 'loading') return;
    if (progressSessionRef.current?.state === 'active') {
      if (source === 'notification') void recordAnalyticsEvent(AsyncStorage, 'progress_started', { source });
      return;
    }
    const schedule = activeSchedule ?? draft;
    const plan = activePlan ?? createCurrentPlan(schedule);
    const session = createProgressSession({ schedule, plan });
    await commitProgress(session);
    void recordAnalyticsEvent(AsyncStorage, 'progress_started', {
      source,
      scheduledNotifications: progressSessionRef.current?.scheduledNotifications.length ?? 0,
    });
  }, [activePlan, activeSchedule, commitProgress, createCurrentPlan, draft, progressStatus]);

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
    }
    await commitProgress(next);
  }, [applyPersonalizationProfile, commitProgress]);

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
    if (!current) {
      const schedule = activeSchedule ?? draft;
      const plan = activePlan ?? createCurrentPlan(schedule);
      const next = updateProgressRoute(createProgressSession({ schedule, plan }), nextRoute);
      await commitProgress(next);
      return;
    }
    const next = updateProgressRoute(current, nextRoute);
    await commitProgress(next);
  }, [activePlan, activeSchedule, commitProgress, createCurrentPlan, draft]);

  const value = useMemo<ScheduleContextValue>(() => ({
    timeline,
    delayMinutes,
    route,
    draft,
    activeSchedule,
    activePlan,
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
    async finalizeDraft() {
      const nextPlan = createCurrentPlan(draft);
      const currentProgress = progressSessionRef.current;
      notificationGeneration.current += 1;
      await cancelProgressNotifications(currentProgress);
      progressSessionRef.current = null;
      setProgressSession(null);
      setPendingDelayProposal(null);
      await removePersistedProgress();
      setActiveSchedule(draft);
      setActivePlan(nextPlan);
      setTimeline(nextPlan.timeline);
      setDraftPhase('finalized');
      try {
        if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current);
        draftWriteTimer.current = null;
        await draftWriteQueue.current.catch(() => undefined);
        await clearScheduleDraft(AsyncStorage);
        setDraftStatus('saved');
      } catch {
        setDraftStatus('error');
      }
      void recordAnalyticsEvent(AsyncStorage, 'draft_completed');
    },
    useStandardPlan() {
      const schedule = activeSchedule ?? draft;
      const nextPlan = createSchedulePlan(schedule, { now: currentClock() });
      setActivePlan(nextPlan);
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
      setTimeline(initialTimeline);
      setDelayMinutes(6);
      setRoute('지하철');
      setActivePlan(null);
      setActiveSchedule(null);
      progressSessionRef.current = null;
      setProgressSession(null);
      setPendingDelayProposal(null);
      setProgressStatus('saved');
      await removePersistedProgress();
    },
  }), [activePlan, activeSchedule, applyDelayProposal, applyPersonalizationProfile, applyRoute, beginDraft, completeCurrent, createCurrentPlan, delayMinutes, draft, draftStatus, lastPersonalizationLearnedCount, notificationStatus, pendingDelayProposal, personalizationProfile, personalizationStatus, progressSession, progressStatus, proposeDelay, rejectDelayProposal, removePersistedProgress, route, startProgress, timeline]);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error('useSchedule must be used inside ScheduleProvider');
  return value;
}
