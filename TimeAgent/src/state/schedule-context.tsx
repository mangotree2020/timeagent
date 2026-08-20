import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { TimelineStep } from '@/data/demo';
import { recordAnalyticsEvent } from '@/lib/analytics';
import { loadAppSettings } from '@/lib/app-settings';
import { routinesForPreset } from '@/lib/preparation-profile';
import { cancelConfirmedPlanStart, scheduleConfirmedPlanStart } from '@/lib/confirmed-plan-notification-service';
import {
  addConfirmedPlan,
  completeConfirmedPlan,
  confirmSchedulePlan,
  ConfirmedSchedulePlan,
  findDueConfirmedPlan,
  loadConfirmedPlans,
  markConfirmedPlanState,
  removeConfirmedPlan,
  replaceConfirmedPlan,
  saveConfirmedPlans,
  settlePastConfirmedPlans,
} from '@/lib/confirmed-plans';
import {
  clearScheduleDraft,
  createDefaultScheduleDraft,
  loadScheduleDraft,
  resolveTransportMode,
  saveScheduleDraft,
  ScheduleDraft,
  ScheduleDraftStep,
} from '@/lib/schedule-draft';
import { createSchedulePlan, currentClock, SchedulePlan } from '@/lib/planning';
import { readCurrentCoordinate } from '@/lib/current-position';
import { createConfiguredMobilityProvider } from '@/lib/mobility-api';
import { ROUTED_TRANSPORT_MODES, TravelEstimate, TravelEstimates, travelMinutesForMode } from '@/lib/travel-estimate';
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
  applyProgressNotificationAction,
  PROGRESS_EXTEND_ACTION,
  PROGRESS_EXTEND_MINUTES,
} from '@/lib/local-notifications';
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

/** One destination, one set of measurements. The coordinate names it; the typed name does not. */
function placeKey(coordinate: { latitude: number; longitude: number } | null | undefined) {
  return coordinate ? `${coordinate.latitude},${coordinate.longitude}` : null;
}

type ScheduleContextValue = {
  timeline: TimelineStep[];
  delayMinutes: number;
  route: string;
  draft: ScheduleDraft;
  activeSchedule: ScheduleDraft | null;
  activePlan: SchedulePlan | null;
  activeConfirmedPlanId: string | null;
  editingConfirmedPlanId: string | null;
  pendingSchedule: ScheduleDraft | null;
  pendingPlan: SchedulePlan | null;
  confirmedPlans: ConfirmedSchedulePlan[];
  confirmedPlansStatus: 'loading' | 'saving' | 'saved' | 'error';
  draftStatus: 'loading' | 'saving' | 'saved' | 'error';
  progressSession: ProgressSession | null;
  pendingDelayProposal: ProgressDelayProposal | null;
  progressStatus: 'loading' | 'saving' | 'saved' | 'error';
  notificationStatus: ProgressNotificationStatus;
  /**
   * What the journey to this schedule's destination actually takes, or null while nothing has been
   * measured and nothing located. Null is normal; every caller can plan without it.
   */
  travelEstimateFor: (schedule: ScheduleDraft) => TravelEstimate | null;
  personalizationProfile: PersonalizationProfile;
  personalizationStatus: 'loading' | 'saving' | 'saved' | 'error';
  lastPersonalizationLearnedCount: number;
  startProgress: (source?: 'notification' | 'direct' | 'auto', confirmedPlanId?: string) => Promise<void>;
  answerStepAlarm: (actionIdentifier: string, stepId: string | null) => Promise<void>;
  proposeDelay: (minutes: number) => void;
  applyDelayProposal: () => Promise<void>;
  rejectDelayProposal: () => void;
  completeCurrent: () => Promise<void>;
  /** Resolves false when the route could not be applied, so the screen can say so instead of implying success. */
  applyRoute: (route: string) => Promise<boolean>;
  updateDraft: (values: Partial<ScheduleDraft>) => void;
  setDraftStep: (step: ScheduleDraftStep) => void;
  beginDraft: (reset?: boolean) => void;
  beginDraftWith: (values: Partial<ScheduleDraft>) => void;
  finalizeDraft: () => Promise<void>;
  finalizeDraftWith: (schedule: ScheduleDraft) => Promise<void>;
  confirmDraftWith: (schedule: ScheduleDraft) => Promise<ConfirmedSchedulePlan>;
  confirmPendingPlan: () => Promise<ConfirmedSchedulePlan>;
  selectConfirmedPlan: (id: string) => void;
  beginEditConfirmedPlan: (id: string) => void;
  deleteConfirmedPlan: (id: string) => Promise<void>;
  useStandardPlan: () => void;
  setPersonalizationEnabled: (enabled: boolean) => Promise<void>;
  resetPersonalization: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export function ScheduleProvider({ children }: PropsWithChildren) {
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  // No delay until a running session reports one — a seeded value lights up the home alert badge
  // and shows "지연" on a schedule that has not even started.
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [route, setRoute] = useState('지하철');
  const [draft, setDraft] = useState(createDefaultScheduleDraft);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleDraft | null>(null);
  const [activePlan, setActivePlan] = useState<SchedulePlan | null>(null);
  const [activeConfirmedPlanId, setActiveConfirmedPlanId] = useState<string | null>(null);
  const [editingConfirmedPlanId, setEditingConfirmedPlanId] = useState<string | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<ScheduleDraft | null>(null);
  /** The pending schedule as it stands when a lookup lands, which is not during any render. */
  const pendingScheduleRef = useRef<ScheduleDraft | null>(null);
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
  /**
   * Real journey times, keyed by mode so switching between 지하철 and 택시 answers from the same
   * lookup instead of asking again — and stamped with the place they were measured to. A lookup
   * takes a moment, and a plan confirmed during that moment must not be timed with the previous
   * destination's journey, so the stamp is checked before the numbers are used at all.
   */
  const travelEstimatesRef = useRef<{ place: string | null; estimates: TravelEstimates }>({ place: null, estimates: {} });
  const applyTravelEstimates = useCallback((place: string | null, estimates: TravelEstimates) => {
    travelEstimatesRef.current = { place, estimates };
  }, []);
  const travelEstimateFor = useCallback((schedule: ScheduleDraft) => {
    const place = placeKey(schedule.destinationCoordinate);
    const measured = travelEstimatesRef.current;
    return travelMinutesForMode(
      schedule.transport,
      place && measured.place === place ? measured.estimates : {},
      schedule.destinationDistanceMeters,
    );
  }, []);

  // One lookup per destination, covering every mode, so choosing 지하철 over 택시 is answered from
  // what the road and the timetables already said rather than by asking again. It runs on the
  // coordinate, not the name: the same place renamed is the same journey.
  const applyPersonalizationProfile = useCallback((profile: PersonalizationProfile) => {
    personalizationRef.current = profile;
    setPersonalizationProfile(profile);
  }, []);
  const createCurrentPlan = useCallback((schedule: ScheduleDraft) => createSchedulePlan(schedule, {
    now: currentClock(),
    personalization: createPlanPersonalization(personalizationRef.current, schedule),
    // How long the journey takes, asked of the road and the timetables rather than assumed. Absent
    // until the lookup lands, and absent for good if the providers cannot answer; the planner then
    // measures the distance itself.
    travelMinutes: travelEstimateFor(schedule)?.minutes,
  }), [travelEstimateFor]);
  useEffect(() => { pendingScheduleRef.current = pendingSchedule; }, [pendingSchedule]);

  const destinationKey = placeKey(draft.destinationCoordinate);
  useEffect(() => {
    let active = true;
    const destination = draft.destinationCoordinate;
    void (async () => {
      // Estimates belong to one destination. Clearing them here rather than on the way in keeps the
      // previous journey's times from being read against a place they were never measured for.
      if (!destinationKey || !destination) {
        if (active) applyTravelEstimates(null, {});
        return;
      }
      const origin = await readCurrentCoordinate();
      if (!active) return;
      if (!origin) {
        applyTravelEstimates(destinationKey, {});
        return;
      }
      try {
        const estimates = await createConfiguredMobilityProvider()
          .getTravelEstimates({ origin, destination, modes: ROUTED_TRANSPORT_MODES });
        if (!active) return;
        applyTravelEstimates(destinationKey, estimates);
        // A plan made before this landed was timed by distance arithmetic. It is made again now,
        // for the place it is actually to — otherwise the screen keeps the guess until someone
        // edits the schedule, which is exactly what nobody would think to do.
        setPendingPlan((current) => {
          const schedule = pendingScheduleRef.current;
          if (!current || !schedule || placeKey(schedule.destinationCoordinate) !== destinationKey) return current;
          const next = createCurrentPlan(schedule);
          return next.travelMinutes === current.travelMinutes ? current : next;
        });
      } catch {
        // Nothing to tell anyone: the planner measures the distance itself when this is empty.
        if (active) applyTravelEstimates(destinationKey, {});
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTravelEstimates, createCurrentPlan, destinationKey]);

  const startNewDraft = useCallback((values: Partial<ScheduleDraft> = {}) => {
    const generation = ++draftRequestGeneration.current;
    const commonDraft = createDefaultScheduleDraft();
    const initialRoutines = commonDraft.routines;
    setPendingSchedule(null);
    setPendingPlan(null);
    setEditingConfirmedPlanId(null);
    setDraft({ ...commonDraft, ...values, step: 0 });
    setDraftStatus('saving');
    setDraftPhase('editing');
    if (values.routines) return;
    void loadAppSettings(AsyncStorage)
      .then((settings) => {
        if (draftRequestGeneration.current !== generation) return;
        const recommendedRoutines = routinesForPreset(settings.preparationGender, settings.routinePreset);
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
    if (!session) {
      setActiveConfirmedPlanId(null);
      return;
    }
    setActiveConfirmedPlanId(session.confirmedPlanId ?? null);
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
      ?? plans.find((plan) => plan.state === 'scheduled');
    if (!next) {
      setActiveSchedule(null);
      setActivePlan(null);
      setActiveConfirmedPlanId(null);
      setTimeline([]);
      return;
    }
    setActiveSchedule(next.schedule);
    setActivePlan(next.plan);
    setActiveConfirmedPlanId(next.id);
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
      .then(async (savedDraft) => {
        if (!active || newDraftRequested.current) return;
        if (savedDraft) {
          setDraft(savedDraft);
          return;
        }
        // Without a saved draft the initial state keeps the common preset, which includes 화장
        // even for a male profile. The voice flow inherits this draft without ever opening the
        // create screen, so the profile routines have to be applied here as well.
        const settings = await loadAppSettings(AsyncStorage);
        if (!active || newDraftRequested.current) return;
        setDraft((current) => ({ ...current, routines: routinesForPreset(settings.preparationGender, settings.routinePreset) }));
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
      .then(async (plans) => {
        if (!active) return;
        const settled = settlePastConfirmedPlans(plans);
        applyConfirmedPlans(settled);
        if (settled.some((plan, index) => plan !== plans[index])) {
          await persistConfirmedPlans(settled);
        } else {
          setConfirmedPlansStatus('saved');
        }
      })
      .catch(() => {
        if (active) setConfirmedPlansStatus('error');
      });
    return () => { active = false; };
  }, [applyConfirmedPlans, persistConfirmedPlans]);

  useEffect(() => {
    if (confirmedPlansStatus === 'loading' || progressStatus === 'loading') return;
    let cancelled = false;

    const settleElapsedPlans = async () => {
      const currentPlans = confirmedPlansRef.current;
      const settled = settlePastConfirmedPlans(currentPlans);
      const changed = settled.some((plan, index) => plan !== currentPlans[index]);
      const currentProgress = progressSessionRef.current;
      const progressPlan = currentProgress?.confirmedPlanId
        ? settled.find((plan) => plan.id === currentProgress.confirmedPlanId)
        : null;
      const shouldCloseProgress = !!currentProgress?.confirmedPlanId
        && (!progressPlan || progressPlan.state === 'completed' || progressPlan.state === 'incomplete');
      if ((!changed && !shouldCloseProgress) || cancelled) return;

      if (currentProgress && shouldCloseProgress) {
        notificationGeneration.current += 1;
        await cancelProgressNotifications(currentProgress);
        if (cancelled) return;
        progressSessionRef.current = null;
        setProgressSession(null);
        setPendingDelayProposal(null);
        await removePersistedProgress();
      }
      if (cancelled) return;
      if (changed) await commitConfirmedPlans(settled);
      else applyConfirmedPlans(settled);
    };

    void settleElapsedPlans();
    const nextExpiry = confirmedPlansRef.current
      .filter((plan) => plan.state === 'scheduled' || plan.state === 'active')
      .sort((left, right) => left.appointmentAt - right.appointmentAt)[0]?.appointmentAt;
    const timer = nextExpiry === undefined ? null : setTimeout(
      () => void settleElapsedPlans(),
      Math.max(0, Math.min(nextExpiry - Date.now(), 2_147_000_000)),
    );
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void settleElapsedPlans();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [applyConfirmedPlans, commitConfirmedPlans, confirmedPlans, confirmedPlansStatus, progressStatus, removePersistedProgress]);

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
    // Reaching here means no session is running. A plan already marked `active` therefore lost its
    // session — an app kill between the two writes — and would otherwise stay unstartable forever.
    const stored = confirmedPlanId
      ? confirmedPlansRef.current.find((item) => item.id === confirmedPlanId
        && (item.state === 'scheduled' || item.state === 'active')) ?? null
      : findDueConfirmedPlan(confirmedPlansRef.current);
    // Someone who is ready early can start ahead of the scheduled time when they ask for it
    // themselves. Automatic and notification starts still wait for the time to arrive.
    if (!stored) return;
    if (source !== 'direct' && stored.prepStartAt > Date.now()) return;
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
        await commitConfirmedPlans(completeConfirmedPlan(
          confirmedPlansRef.current,
          current.confirmedPlanId,
          {
            completedAt: next.updatedAt,
            onTime: next.delayMinutes <= next.plan.bufferMinutes,
            delayMinutes: next.delayMinutes,
          },
        ));
      }
    }
    await commitProgress(next);
  }, [applyPersonalizationProfile, commitConfirmedPlans, commitProgress]);

  /** Applies a choice made on the alarm itself, where the user has already decided. */
  const answerStepAlarm = useCallback(async (actionIdentifier: string, stepId: string | null) => {
    const current = progressSessionRef.current;
    if (!current) return;
    const result = applyProgressNotificationAction(current, actionIdentifier, stepId);
    if (!result.applied) return;
    setPendingDelayProposal(null);
    void recordAnalyticsEvent(AsyncStorage, result.action === PROGRESS_EXTEND_ACTION ? 'delay_applied' : 'step_completed', {
      source: 'notification-action',
      ...(result.action === PROGRESS_EXTEND_ACTION ? { minutes: PROGRESS_EXTEND_MINUTES } : { stepId: stepId ?? '' }),
    });
    await commitProgress(result.session);
  }, [commitProgress]);

  // Buttons pressed on the alarm arrive here, so the running session stays the single source of
  // truth instead of the notification writing to storage behind the screen's back.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.source !== 'progress-session') return;
      const stepId = typeof data.stepId === 'string' ? data.stepId : null;
      void answerStepAlarm(response.actionIdentifier, stepId);
    });
    return () => subscription.remove();
  }, [answerStepAlarm]);

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
      const nextSchedule = { ...pendingSchedule, transport: resolveTransportMode(nextRoute) };
      const nextPlan = createCurrentPlan(nextSchedule);
      setPendingSchedule(nextSchedule);
      setPendingPlan(nextPlan);
      setTimeline(nextPlan.timeline);
      setRoute(nextRoute);
      return true;
    }
    if (!current) {
      // A confirmed plan must never become active through a route change.
      // It will be started only by the scheduled-time checker.
      return false;
    }
    const next = updateProgressRoute(current, nextRoute);
    await commitProgress(next);
    return true;
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

  const confirmScheduleDirectly = useCallback(async (schedule: ScheduleDraft) => {
    const plan = createCurrentPlan(schedule);
    await finalizeSchedule(schedule);
    const confirmed = confirmSchedulePlan({ schedule, plan });
    const notification = await scheduleConfirmedPlanStart(confirmed);
    const stored = notification.identifier
      ? { ...confirmed, notificationIdentifier: notification.identifier }
      : confirmed;
    await commitConfirmedPlans(addConfirmedPlan(confirmedPlansRef.current, stored));
    await clearScheduleDraft(AsyncStorage);
    setPendingSchedule(null);
    setPendingPlan(null);
    setNotificationStatus(notification.status);
    void recordAnalyticsEvent(AsyncStorage, 'draft_completed', { confirmed: true, source: 'voice' });
    return stored;
  }, [commitConfirmedPlans, createCurrentPlan, finalizeSchedule]);

  const beginEditConfirmedPlan = useCallback((id: string) => {
    const selected = confirmedPlansRef.current.find((plan) => plan.id === id);
    if (!selected) return;
    draftRequestGeneration.current += 1;
    newDraftRequested.current = true;
    setEditingConfirmedPlanId(id);
    setPendingSchedule(null);
    setPendingPlan(null);
    setDraft({ ...selected.schedule, routines: selected.schedule.routines.map((routine) => ({ ...routine })), step: 0 });
    setDraftPhase('editing');
    setDraftStatus('saved');
  }, []);

  const deleteConfirmedPlan = useCallback(async (id: string) => {
    const selected = confirmedPlansRef.current.find((plan) => plan.id === id);
    if (!selected) return;
    await cancelConfirmedPlanStart(selected);
    const currentProgress = progressSessionRef.current;
    if (currentProgress?.confirmedPlanId === id) {
      notificationGeneration.current += 1;
      await cancelProgressNotifications(currentProgress);
      applyProgressState(null);
      await removePersistedProgress();
    }
    if (editingConfirmedPlanId === id) setEditingConfirmedPlanId(null);
    await commitConfirmedPlans(removeConfirmedPlan(confirmedPlansRef.current, id));
  }, [applyProgressState, commitConfirmedPlans, editingConfirmedPlanId, removePersistedProgress]);

  const value = useMemo<ScheduleContextValue>(() => ({
    timeline,
    delayMinutes,
    route,
    draft,
    activeSchedule,
    activePlan,
    activeConfirmedPlanId,
    editingConfirmedPlanId,
    pendingSchedule,
    pendingPlan,
    confirmedPlans,
    confirmedPlansStatus,
    draftStatus,
    progressSession,
    pendingDelayProposal,
    progressStatus,
    notificationStatus,
    travelEstimateFor,
    personalizationProfile,
    personalizationStatus,
    lastPersonalizationLearnedCount,
    startProgress,
    answerStepAlarm,
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
    confirmDraftWith: confirmScheduleDirectly,
    async confirmPendingPlan() {
      if (!pendingSchedule || !pendingPlan) throw new Error('확정할 계획이 없습니다.');
      const editing = editingConfirmedPlanId
        ? confirmedPlansRef.current.find((plan) => plan.id === editingConfirmedPlanId)
        : null;
      const created = confirmSchedulePlan({ schedule: pendingSchedule, plan: pendingPlan });
      const confirmed = editing ? {
        ...created,
        id: editing.id,
        confirmedAt: editing.confirmedAt,
      } : created;
      const notification = await scheduleConfirmedPlanStart(confirmed);
      const stored = notification.identifier
        ? { ...confirmed, notificationIdentifier: notification.identifier }
        : confirmed;
      if (editing) await cancelConfirmedPlanStart(editing);
      await commitConfirmedPlans(editing
        ? replaceConfirmedPlan(confirmedPlansRef.current, editing.id, stored)
        : addConfirmedPlan(confirmedPlansRef.current, stored));
      await clearScheduleDraft(AsyncStorage);
      setPendingSchedule(null);
      setPendingPlan(null);
      setEditingConfirmedPlanId(null);
      setNotificationStatus(notification.status);
      void recordAnalyticsEvent(AsyncStorage, 'draft_completed', { confirmed: true, edited: !!editing });
      return stored;
    },
    selectConfirmedPlan(id) {
      const selected = confirmedPlansRef.current.find((plan) => plan.id === id);
      if (!selected) return;
      setEditingConfirmedPlanId(null);
      setPendingSchedule(null);
      setPendingPlan(null);
      setActiveSchedule(selected.schedule);
      setActivePlan(selected.plan);
      setActiveConfirmedPlanId(selected.id);
      setTimeline(selected.plan.timeline);
      setRoute(selected.schedule.transport);
    },
    beginEditConfirmedPlan,
    deleteConfirmedPlan,
    useStandardPlan() {
      const schedule = pendingSchedule ?? activeSchedule ?? draft;
      const nextPlan = createSchedulePlan(schedule, {
        now: currentClock(),
        travelMinutes: travelEstimateFor(schedule)?.minutes,
      });
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
      setDelayMinutes(0);
      setRoute('지하철');
      setActivePlan(null);
      setActiveSchedule(null);
      setActiveConfirmedPlanId(null);
      setEditingConfirmedPlanId(null);
      setPendingPlan(null);
      setPendingSchedule(null);
      progressSessionRef.current = null;
      setProgressSession(null);
      setPendingDelayProposal(null);
      setProgressStatus('saved');
      await removePersistedProgress();
    },
  }), [activeConfirmedPlanId, activePlan, activeSchedule, answerStepAlarm, applyDelayProposal, applyPersonalizationProfile, applyRoute, beginDraft, beginEditConfirmedPlan, commitConfirmedPlans, completeCurrent, confirmScheduleDirectly, confirmedPlans, confirmedPlansStatus, delayMinutes, deleteConfirmedPlan, draft, draftStatus, editingConfirmedPlanId, finalizeSchedule, lastPersonalizationLearnedCount, notificationStatus, pendingDelayProposal, pendingPlan, pendingSchedule, personalizationProfile, personalizationStatus, progressSession, progressStatus, proposeDelay, rejectDelayProposal, removePersistedProgress, route, startNewDraft, startProgress, timeline, travelEstimateFor]);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error('useSchedule must be used inside ScheduleProvider');
  return value;
}
